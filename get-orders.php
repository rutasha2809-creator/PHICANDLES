<?php
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$email = trim($_GET['email'] ?? '');
$phone = trim($_GET['phone'] ?? '');

if (!$email && !$phone) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Укажите email или телефон']);
    exit;
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    if ($email) {
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE email = ? ORDER BY created_at DESC');
        $stmt->execute([$email]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC');
        $stmt->execute([$phone]);
    }

    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'orders' => $orders]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Ошибка базы данных']);
}
