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

$company   = htmlspecialchars($data['company']       ?? '');
$contact   = htmlspecialchars($data['contact']       ?? '');
$phone     = htmlspecialchars($data['phone']         ?? '');
$email     = htmlspecialchars($data['email']         ?? '');
$messenger = htmlspecialchars($data['messenger']     ?? '');
$purpose   = htmlspecialchars($data['purpose']       ?? '');
$quantity  = htmlspecialchars($data['quantity']      ?? '');
$products  = htmlspecialchars($data['products']      ?? '');
$budget    = htmlspecialchars($data['budget']        ?? '');
$custom    = htmlspecialchars($data['customization'] ?? '');
$date      = htmlspecialchars($data['delivery_date'] ?? '');
$city      = htmlspecialchars($data['city']          ?? '');
$comment   = htmlspecialchars($data['comment']       ?? '');

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
    $mail->addReplyTo($email, $contact);

    $mail->Subject = 'Корпоративный заказ PHICANDLES — ' . $company;
    $mail->Body    = "Корпоративный запрос с сайта phicandles.ru\n\n"
                   . "Компания:      {$company}\n"
                   . "Контактное лицо: {$contact}\n"
                   . "Телефон:       {$phone}\n"
                   . "Email:         {$email}\n"
                   . "Мессенджер:    {$messenger}\n\n"
                   . "Назначение:    {$purpose}\n"
                   . "Количество:    {$quantity}\n"
                   . "Продукты:      {$products}\n"
                   . "Бюджет:        {$budget}\n"
                   . "Кастомизация:  {$custom}\n"
                   . "Дата:          {$date}\n"
                   . "Город:         {$city}\n"
                   . "Комментарий:   {$comment}";

    $mail->send();
    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $mail->ErrorInfo]);
}
