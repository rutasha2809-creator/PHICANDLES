<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/phpmailer/Exception.php';
require_once __DIR__ . '/phpmailer/PHPMailer.php';
require_once __DIR__ . '/phpmailer/SMTP.php';

session_start();
if (empty($_SESSION['admin'])) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Не авторизован']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

$data = json_decode(file_get_contents('php://input'), true);
$id     = intval($data['id'] ?? 0);
$status = trim($data['status'] ?? '');

$allowed = ['Принят', 'В работе', 'Отправлен', 'Доставлен'];
if (!$id || !in_array($status, $allowed)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Неверные данные']);
    exit;
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Получить заказ
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Заказ не найден']);
        exit;
    }

    // Обновить статус
    $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $id]);

    // PHI-клуб: баллы начисляются, когда заказ доставлен (один раз на заказ)
    if ($status === 'Доставлен' && !empty($order['email'])) {
        try {
            $mEmail = trim(strtolower($order['email']));
            $st = $pdo->prepare('SELECT * FROM loyalty_members WHERE LOWER(email) = ?');
            $st->execute([$mEmail]);
            $member = $st->fetch(PDO::FETCH_ASSOC);
            if ($member) {
                $st = $pdo->prepare("SELECT COUNT(*) FROM loyalty_transactions WHERE email = ? AND type = 'earned' AND order_id = ?");
                $st->execute([$member['email'], $order['order_number']]);
                if ((int)$st->fetchColumn() === 0) {
                    // Сумма заказа без доставки: из «Итого» вычитаем строку доставки из состава
                    $sum = (float)preg_replace('/\D+/', '', (string)$order['total']);
                    if (preg_match('/Доставка[^\n]*?=\s*([\d\s\x{00a0}]+)\s*₽/u', (string)$order['items'], $dm)) {
                        $sum -= (float)preg_replace('/\D+/', '', $dm[1]);
                    }
                    if ($sum > 0) {
                        $spent  = (float)$member['total_spent'] + $sum;
                        $cb     = $spent >= 10000 ? 7 : ($spent >= 3000 ? 5 : 3);
                        $earned = (int)round($sum * $cb / 100);
                        $pdo->prepare('UPDATE loyalty_members SET points_balance = points_balance + ?, total_spent = total_spent + ? WHERE email = ?')
                            ->execute([$earned, $sum, $member['email']]);
                        $pdo->prepare('INSERT INTO loyalty_transactions (email, type, points, order_id, description) VALUES (?, ?, ?, ?, ?)')
                            ->execute([$member['email'], 'earned', $earned, $order['order_number'], 'Начислено за заказ ' . $order['order_number'] . ' (' . $cb . '%)']);
                    }
                }
            }
        } catch (Exception $e) {
            // Баллы не начислились — статус уже обновлён, не прерываем
        }
    }

    // Отправить письмо клиенту
    $statusRu = [
        'В работе'  => 'принят в работу и сейчас изготавливается',
        'Отправлен' => 'отправлен — ожидайте доставку',
        'Доставлен' => 'доставлен. Спасибо за покупку!'
    ];

    if (isset($statusRu[$status]) && !empty($order['email'])) {
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = SMTP_HOST;
            $mail->SMTPAuth   = true;
            $mail->Username   = SMTP_USER;
            $mail->Password   = SMTP_PASS;
            $mail->SMTPSecure = 'ssl';
            $mail->Port       = SMTP_PORT;
            $mail->CharSet    = 'UTF-8';

            $mail->setFrom(SMTP_FROM, SMTP_FROM_NAME);
            $mail->addAddress($order['email'], $order['name']);

            $mail->Subject = 'Статус заказа ' . $order['order_number'] . ' обновлён';
            $mail->Body    = "Здравствуйте, {$order['name']}!\n\n"
                           . "Ваш заказ {$order['order_number']} {$statusRu[$status]}.\n\n"
                           . "Состав заказа:\n{$order['items']}\n\n"
                           . "Итого: {$order['total']}\n\n"
                           . "По всем вопросам:\n"
                           . "Email: orders@phicandles.ru\n"
                           . "Telegram: https://t.me/phi_candles\n\n"
                           . "С теплом, PHICANDLES";

            $mail->send();
        } catch (Exception $e) {
            // Письмо не отправилось — не критично, статус уже обновлён
        }
    }

    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Ошибка базы данных']);
}
