<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/phpmailer/Exception.php';
require_once __DIR__ . '/phpmailer/PHPMailer.php';
require_once __DIR__ . '/phpmailer/SMTP.php';

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$name    = htmlspecialchars($data['name']    ?? '');
$phone   = htmlspecialchars($data['phone']   ?? '');
$email   = htmlspecialchars($data['email']   ?? '');
$address = htmlspecialchars($data['address'] ?? '');
$comment = htmlspecialchars($data['comment'] ?? '');
$items   = htmlspecialchars($data['items']   ?? '');
$total   = htmlspecialchars($data['total']   ?? '');

// Сохранить заказ в MySQL
function saveOrderToDB($orderNumber, $name, $phone, $email, $address, $comment, $items, $total) {
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $stmt = $pdo->prepare(
            'INSERT INTO orders (order_number, name, phone, email, address, comment, items, total, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$orderNumber, $name, $phone, $email, $address, $comment, $items, $total, 'Принят']);
    } catch (Exception $e) {
        // Логируем ошибку БД, но не прерываем отправку письма
        error_log('DB error: ' . $e->getMessage());
    }
}

$orderNumber = $data['orderNumber'] ?? ('ORD-' . date('Ymd') . '-' . rand(1000, 9999));

// Сохраняем в базу
saveOrderToDB($orderNumber, $name, $phone, $email, $address, $comment, $items, $total);

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
    $mail->addAddress(ORDER_TO);
    $mail->addReplyTo($email, $name);

    $mail->Subject = 'Новый заказ PHICANDLES — ' . $name . ' (' . $orderNumber . ')';
    $mail->Body    = "Новый заказ с сайта phicandles.ru\n\n"
                   . "Номер заказа: {$orderNumber}\n\n"
                   . "Имя:         {$name}\n"
                   . "Телефон:     {$phone}\n"
                   . "Email:       {$email}\n"
                   . "Доставка:    {$address}\n"
                   . "Комментарий: {$comment}\n\n"
                   . "Состав заказа:\n{$items}\n\n"
                   . "Итого: {$total}";

    $mail->send();

    // Письмо клиенту с подтверждением заказа
    if ($email) {
        $mailClient = new PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mailClient->isSMTP();
            $mailClient->Host       = SMTP_HOST;
            $mailClient->SMTPAuth   = true;
            $mailClient->Username   = SMTP_USER;
            $mailClient->Password   = SMTP_PASS;
            $mailClient->SMTPSecure = 'ssl';
            $mailClient->Port       = SMTP_PORT;
            $mailClient->CharSet    = 'UTF-8';

            $mailClient->setFrom(SMTP_FROM, SMTP_FROM_NAME);
            $mailClient->addAddress($email, $name);

            $mailClient->Subject = 'Заказ ' . $orderNumber . ' — PHICANDLES';
            $mailClient->Body    = "Здравствуйте, {$name}!\n\n"
                                 . "Ваш заказ успешно принят. Мы свяжемся с вами в ближайшее время.\n\n"
                                 . "Номер заказа: {$orderNumber}\n\n"
                                 . "Состав заказа:\n{$items}\n\n"
                                 . "Итого: {$total}\n\n"
                                 . "Доставка: {$address}\n"
                                 . ($comment && $comment !== '—' ? "Комментарий: {$comment}\n\n" : "\n")
                                 . "Отследить статус заказа: https://phicandles.ru/orders/\n\n"
                                 . "По всем вопросам:\n"
                                 . "Email: orders@phicandles.ru\n"
                                 . "Telegram: https://t.me/phi_candles\n\n"
                                 . "С теплом, PHICANDLES";

            $mailClient->send();
        } catch (Exception $e) {
            // Письмо клиенту не отправилось — не критично
        }
    }

    // ——— PHI-клуб: списание и начисление баллов ———
    $loyaltyEmail  = trim($data['loyalty_email']       ?? '');
    $loyaltyRedeem = (int)($data['loyalty_redeem']     ?? 0);
    $subtotalPts   = (int)($data['subtotal_for_points'] ?? 0);
    if ($loyaltyEmail) {
        $loyaltyUrl = 'https://api.phicandles.ru/loyalty.php';
        // Списать баллы
        if ($loyaltyRedeem > 0) {
            $ch = curl_init($loyaltyUrl . '?action=redeem');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
                CURLOPT_POSTFIELDS     => json_encode(['email' => $loyaltyEmail, 'points' => $loyaltyRedeem, 'order_id' => $orderNumber]),
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            ]);
            curl_exec($ch); curl_close($ch);
        }
        // Начислить баллы за заказ
        if ($subtotalPts > 0) {
            $ch = curl_init($loyaltyUrl . '?action=add_points');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
                CURLOPT_POSTFIELDS     => json_encode(['email' => $loyaltyEmail, 'order_total' => $subtotalPts, 'order_id' => $orderNumber]),
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            ]);
            curl_exec($ch); curl_close($ch);
        }
    }

    echo json_encode(['ok' => true, 'orderNumber' => $orderNumber]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $mail->ErrorInfo]);
}
