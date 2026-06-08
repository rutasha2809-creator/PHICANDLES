<?php
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ——— Уровни лояльности ———
define('LEVELS', [
    ['name' => 'Новичок',    'min' => 0,     'cashback' => 3],
    ['name' => 'Постоянный', 'min' => 3000,  'cashback' => 5],
    ['name' => 'Преданный',  'min' => 10000, 'cashback' => 7],
]);
define('REFERRAL_BONUS',        300); // баллов за друга (обоим)
define('MAX_REDEEM_PERCENT',    15);  // максимум % от заказа для списания

function getDB() {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }
    return $pdo;
}

function getLevel($totalSpent) {
    $level = LEVELS[0];
    foreach (LEVELS as $l) {
        if ($totalSpent >= $l['min']) $level = $l;
    }
    return $level;
}

function generateReferralCode($name) {
    $clean  = preg_replace('/[^a-zA-Zа-яА-ЯёЁ]/u', '', $name);
    $prefix = mb_strtoupper(mb_substr($clean, 0, 3, 'UTF-8'), 'UTF-8');
    if (mb_strlen($prefix, 'UTF-8') < 2) $prefix = 'PHI';
    return $prefix . strtoupper(substr(md5(uniqid()), 0, 5));
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

$action = $_GET['action'] ?? '';
$data   = json_decode(file_get_contents('php://input'), true) ?? [];

// ——— REGISTER ———
if ($action === 'register') {
    $email       = trim(strtolower($data['email'] ?? ''));
    $name        = trim($data['name']  ?? '');
    $phone       = trim($data['phone'] ?? '');
    $refCode     = trim($data['referral_code'] ?? '');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['ok' => false, 'error' => 'Некорректный email'], 400);
    }

    $pdo = getDB();

    // Проверяем, не зарегистрирован ли уже
    $stmt = $pdo->prepare('SELECT id FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        respond(['ok' => false, 'error' => 'Этот email уже зарегистрирован в программе']);
    }

    // Генерируем уникальный реферальный код
    do {
        $myCode = generateReferralCode($name ?: $email);
        $check  = $pdo->prepare('SELECT id FROM loyalty_members WHERE referral_code = ?');
        $check->execute([$myCode]);
    } while ($check->fetch());

    // Начисляем бонус за реферала
    $referredBy  = null;
    $bonusPoints = 0;
    if ($refCode) {
        $refStmt = $pdo->prepare('SELECT email FROM loyalty_members WHERE referral_code = ?');
        $refStmt->execute([$refCode]);
        $refRow = $refStmt->fetch(PDO::FETCH_ASSOC);
        if ($refRow) {
            $referredBy  = $refCode;
            $bonusPoints = REFERRAL_BONUS;
        }
    }

    // Создаём участника
    $ins = $pdo->prepare(
        'INSERT INTO loyalty_members (email, name, phone, referral_code, referred_by, points_balance)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([$email, $name, $phone, $myCode, $referredBy, $bonusPoints]);

    // Записываем транзакцию бонуса новичку
    if ($bonusPoints > 0) {
        $pdo->prepare(
            'INSERT INTO loyalty_transactions (email, type, points, description) VALUES (?, ?, ?, ?)'
        )->execute([$email, 'referral_friend_bonus', $bonusPoints, 'Бонус за регистрацию по реферальной ссылке']);

        // Бонус тому, кто привёл
        $pdo->prepare(
            'UPDATE loyalty_members SET points_balance = points_balance + ? WHERE referral_code = ?'
        )->execute([REFERRAL_BONUS, $refCode]);
        $pdo->prepare(
            'INSERT INTO loyalty_transactions (email, type, points, description) VALUES (?, ?, ?, ?)'
        )->execute([$refRow['email'], 'referral_bonus', REFERRAL_BONUS, 'Бонус за приглашение друга (' . $email . ')']);
    }

    respond([
        'ok'             => true,
        'referral_code'  => $myCode,
        'bonus_points'   => $bonusPoints,
        'message'        => 'Добро пожаловать в PHI-клуб!'
    ]);
}

// ——— GET MEMBER ———
if ($action === 'get_member') {
    $email = trim(strtolower($data['email'] ?? $_GET['email'] ?? ''));
    if (!$email) respond(['ok' => false, 'error' => 'Email обязателен'], 400);

    $pdo  = getDB();
    $stmt = $pdo->prepare('SELECT * FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) respond(['ok' => false, 'error' => 'Участник не найден']);

    $level   = getLevel((float)$member['total_spent']);
    $nextLevel = null;
    foreach (LEVELS as $i => $l) {
        if ($l['name'] === $level['name'] && isset(LEVELS[$i + 1])) {
            $nextLevel = LEVELS[$i + 1];
            break;
        }
    }

    // История транзакций (последние 20)
    $hist = $pdo->prepare(
        'SELECT type, points, description, order_id, created_at
         FROM loyalty_transactions WHERE email = ?
         ORDER BY created_at DESC LIMIT 20'
    );
    $hist->execute([$email]);
    $history = $hist->fetchAll(PDO::FETCH_ASSOC);

    $memberData = [
        'name'           => $member['name'],
        'email'          => $member['email'],
        'points_balance' => (int)$member['points_balance'],
        'total_spent'    => (float)$member['total_spent'],
        'referral_code'  => $member['referral_code'],
        'level'          => $level,
        'next_level'     => $nextLevel,
        'history'        => $history,
        'max_redeem_pct' => MAX_REDEEM_PERCENT,
    ];
    respond([
        'ok'     => true,
        'member' => $memberData,
        // Плоские поля для обратной совместимости
        'name'           => $member['name'],
        'email'          => $member['email'],
        'points_balance' => (int)$member['points_balance'],
        'referral_code'  => $member['referral_code'],
        'level'          => $level,
        'history'        => $history,
        'max_redeem_pct' => MAX_REDEEM_PERCENT,
    ]);
}

// ——— ADD POINTS (вызывается из send-order.php после оформления заказа) ———
if ($action === 'add_points') {
    $secret = $data['secret'] ?? '';
    if ($secret !== defined('LOYALTY_SECRET') ? LOYALTY_SECRET : '') {
        // Если нет константы — разрешаем вызов только с того же сервера
        if ($_SERVER['REMOTE_ADDR'] !== '127.0.0.1' && $_SERVER['REMOTE_ADDR'] !== $_SERVER['SERVER_ADDR']) {
            respond(['ok' => false, 'error' => 'Forbidden'], 403);
        }
    }

    $email   = trim(strtolower($data['email']    ?? ''));
    $total   = (float)($data['total']   ?? 0);
    $orderId = trim($data['order_id'] ?? '');

    if (!$email || $total <= 0) respond(['ok' => false, 'error' => 'Некорректные данные'], 400);

    $pdo  = getDB();
    $stmt = $pdo->prepare('SELECT * FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) respond(['ok' => false, 'error' => 'Участник не найден']);

    $level  = getLevel((float)$member['total_spent'] + $total);
    $earned = (int)round($total * $level['cashback'] / 100);

    // Начисляем баллы и увеличиваем total_spent
    $pdo->prepare(
        'UPDATE loyalty_members SET points_balance = points_balance + ?, total_spent = total_spent + ? WHERE email = ?'
    )->execute([$earned, $total, $email]);

    $pdo->prepare(
        'INSERT INTO loyalty_transactions (email, type, points, order_id, description) VALUES (?, ?, ?, ?, ?)'
    )->execute([$email, 'earned', $earned, $orderId, 'Начислено за заказ ' . $orderId . ' (' . $level['cashback'] . '%)']);

    respond(['ok' => true, 'earned' => $earned, 'level' => $level['name']]);
}

// ——— CHECK REDEEM (проверка перед списанием) ———
if ($action === 'check_redeem') {
    $email      = trim(strtolower($data['email']      ?? ''));
    $orderTotal = (float)($data['order_total'] ?? 0);
    $points     = (int)($data['points']        ?? 0);

    if (!$email || $orderTotal <= 0 || $points <= 0) {
        respond(['ok' => false, 'error' => 'Некорректные данные'], 400);
    }

    $pdo  = getDB();
    $stmt = $pdo->prepare('SELECT points_balance FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) respond(['ok' => false, 'error' => 'Участник не найден']);

    $maxRedeemable = (int)floor($orderTotal * MAX_REDEEM_PERCENT / 100);
    $balance       = (int)$member['points_balance'];

    if ($points > $balance)           respond(['ok' => false, 'error' => 'Недостаточно баллов. Доступно: ' . $balance]);
    if ($points > $maxRedeemable)     respond(['ok' => false, 'error' => 'Максимум для списания: ' . $maxRedeemable . ' баллов']);

    respond(['ok' => true, 'balance' => $balance, 'max_redeemable' => $maxRedeemable]);
}

// ——— REDEEM POINTS (списание при оформлении заказа) ———
if ($action === 'redeem') {
    $email      = trim(strtolower($data['email']      ?? ''));
    $points     = (int)($data['points']        ?? 0);
    $orderId    = trim($data['order_id']       ?? '');
    $orderTotal = (float)($data['order_total'] ?? 0);

    if (!$email || $points <= 0) respond(['ok' => false, 'error' => 'Некорректные данные'], 400);

    $pdo  = getDB();
    $stmt = $pdo->prepare('SELECT points_balance FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) respond(['ok' => false, 'error' => 'Участник не найден']);

    $maxRedeemable = (int)floor($orderTotal * MAX_REDEEM_PERCENT / 100);
    $balance       = (int)$member['points_balance'];

    if ($points > $balance)       respond(['ok' => false, 'error' => 'Недостаточно баллов']);
    if ($points > $maxRedeemable) respond(['ok' => false, 'error' => 'Превышен лимит списания']);

    $pdo->prepare(
        'UPDATE loyalty_members SET points_balance = points_balance - ? WHERE email = ?'
    )->execute([$points, $email]);

    $pdo->prepare(
        'INSERT INTO loyalty_transactions (email, type, points, order_id, description) VALUES (?, ?, ?, ?, ?)'
    )->execute([$email, 'spent', -$points, $orderId, 'Списано при оформлении заказа ' . $orderId]);

    respond(['ok' => true, 'deducted' => $points, 'new_balance' => $balance - $points]);
}

// ——— GET REFERRAL STATS (кол-во приглашённых друзей) ———
if ($action === 'get_referral_stats') {
    $email = trim(strtolower($data['email'] ?? $_GET['email'] ?? ''));
    if (!$email) respond(['ok' => false, 'error' => 'Email обязателен'], 400);

    $pdo  = getDB();
    $stmt = $pdo->prepare('SELECT referral_code FROM loyalty_members WHERE email = ?');
    $stmt->execute([$email]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) respond(['ok' => false, 'error' => 'Участник не найден']);

    $count = $pdo->prepare('SELECT COUNT(*) FROM loyalty_members WHERE referred_by = ?');
    $count->execute([$member['referral_code']]);
    $friends = (int)$count->fetchColumn();

    respond(['ok' => true, 'friends_count' => $friends]);
}

respond(['ok' => false, 'error' => 'Неизвестное действие'], 400);
