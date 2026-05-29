<?php
// ——— PHICANDLES: СДЭК прокси-API ———
// Загрузить на api.phicandles.ru/cdek-proxy.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://phicandles.ru');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

define('CDEK_ID',     'ywuBbbLsDYvFqoPHN0FzwONsIfsbofeC');
define('CDEK_SECRET', 'R5rWQFnTvXbIMnKyjOC0qqFFu2cNlFvP');
define('CDEK_API',    'https://api.cdek.ru/v2');
define('TOKEN_FILE',  __DIR__ . '/cdek-token.json');

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

function cdekGet($path) {
    $token = getCdekToken();
    if (!$token) { echo json_encode(['error' => 'auth failed']); exit; }
    $ch = curl_init(CDEK_API . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return $result;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'cities':
        $q = $_GET['q'] ?? '';
        if (strlen($q) < 2) { echo '[]'; exit; }
        echo cdekGet('/location/cities?' . http_build_query([
            'city'          => $q,
            'country_codes' => 'RU',
            'size'          => 7,
        ]));
        break;

    case 'pvz':
        $code = (int)($_GET['city_code'] ?? 44);
        echo cdekGet('/deliverypoints?' . http_build_query([
            'city_code'  => $code,
            'type'       => 'PVZ',
            'is_handout' => 'true',
            'size'       => 500,
        ]));
        break;

    case 'calculate':
        $toCode = (int)($_GET['city_code'] ?? 44);
        $token  = getCdekToken();
        if (!$token) { echo json_encode(['error' => 'auth failed']); exit; }
        $body = json_encode([
            'tariff_code'   => 136, // Посылка склад-склад (ПВЗ → ПВЗ)
            'from_location' => ['code' => 44], // Москва — откуда отправляем
            'to_location'   => ['code' => $toCode],
            'packages'      => [['weight' => 500, 'length' => 20, 'width' => 15, 'height' => 10]],
        ]);
        $ch = curl_init(CDEK_API . '/calculator/tariff');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT => 15,
        ]);
        $result = curl_exec($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if ($result === false) {
            echo json_encode(['error' => 'curl error', 'message' => $curlErr]);
        } else {
            echo $result;
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'unknown action']);
}
