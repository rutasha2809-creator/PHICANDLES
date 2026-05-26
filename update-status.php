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
