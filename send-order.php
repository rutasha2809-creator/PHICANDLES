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

    $mail->Subject = 'Новый заказ PHICANDLES — ' . $name;
    $mail->Body    = "Новый заказ с сайта phicandles.ru\n\n"
                   . "Имя:      {$name}\n"
                   . "Телефон:  {$phone}\n"
                   . "Email:    {$email}\n"
                   . "Доставка: {$address}\n"
                   . "Комментарий: {$comment}\n\n"
                   . "Состав заказа:\n{$items}\n\n"
                   . "Итого: {$total}";

    $mail->send();
    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $mail->ErrorInfo]);
}
