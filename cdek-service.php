<?php
// ——— PHICANDLES: СДЭК — токен для виджета ———
// Загрузить на api.phicandles.ru/cdek-service.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://phicandles.ru');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

define('CDEK_ID',     'ywuBbbLsDYvFqoPHN0FzwONsIfsbofeC');
define('CDEK_SECRET', 'R5rWQFnTvXbIMnKyjOC0qqFFu2cNlFvP');
define('CDEK_API',    'https://api.cdek.ru/v2');
define('TOKEN_FILE',  __DIR__ . '/cdek-token.json');

// Получить токен (кэш в файле на 1 час)
function getCdekToken() {
    if (file_exists(TOKEN_FILE)) {
        $cached = json_decode(file_get_contents(TOKEN_FILE), true);
        if (!empty($cached['access_token']) && $cached['expires_at'] > time() + 60) {
            return $cached['access_token'];
        }
    }
    $ch = curl_init(CDEK_API . '/oauth/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type'    => 'client_credentials',
            'client_id'     => CDEK_ID,
            'client_secret' => CDEK_SECRET,
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $data = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($data['access_token'])) return null;
    file_put_contents(TOKEN_FILE, json_encode([
        'access_token' => $data['access_token'],
        'expires_at'   => time() + ($data['expires_in'] ?? 3600),
    ]));
    return $data['access_token'];
}

$token = getCdekToken();
if (!$token) {
    http_response_code(500);
    echo json_encode(['error' => 'CDEK auth failed']);
    exit;
}

// Виджет v3 ожидает {access_token: "..."}
echo json_encode(['access_token' => $token]);
