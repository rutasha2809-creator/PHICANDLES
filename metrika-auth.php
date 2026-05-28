<?php
// ——— PHICANDLES: Авторизация Яндекс Метрики ———
// Загрузить на api.phicandles.ru рядом с send-order.php
// Открыть в браузере: https://api.phicandles.ru/metrika-auth.php

define('CLIENT_ID',     '16ebd611b732489686cc3201f97f607a');
define('CLIENT_SECRET', 'ccb5b31456e3493788df14167ce872bb');
define('TOKEN_FILE',    __DIR__ . '/metrika-token.json');

// ——— Шаг 2: пользователь вставил код — меняем на токен ———
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['code'])) {
    $code = trim($_POST['code']);

    $ch = curl_init('https://oauth.yandex.ru/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'client_id'     => CLIENT_ID,
            'client_secret' => CLIENT_SECRET,
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response, true);

    if (!empty($data['access_token'])) {
        file_put_contents(TOKEN_FILE, json_encode([
            'access_token'  => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? null,
            'expires_in'    => $data['expires_in'] ?? 31536000,
            'created_at'    => time(),
        ], JSON_PRETTY_PRINT));
        $success = true;
    } else {
        $error = $data['error_description'] ?? $data['error'] ?? 'Неизвестная ошибка';
    }
}

$already = file_exists(TOKEN_FILE) ? json_decode(file_get_contents(TOKEN_FILE), true) : null;
$auth_url = 'https://oauth.yandex.ru/authorize?' . http_build_query([
    'response_type' => 'code',
    'client_id'     => CLIENT_ID,
    'force_confirm' => 'yes',
]);
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Авторизация Метрики — PHICANDLES</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; padding: 40px; background: #f5f5f5; margin: 0; }
    .box { background: #fff; padding: 32px; border-radius: 8px; max-width: 520px; margin: 0 auto; }
    h2 { margin: 0 0 8px; font-size: 1.3rem; }
    p { color: #555; font-size: 0.93rem; line-height: 1.6; margin: 0 0 16px; }
    .step { background: #f9f9f9; border: 1px solid #eee; border-radius: 6px; padding: 16px 20px; margin-bottom: 16px; }
    .step-num { font-weight: bold; color: #999; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 6px; }
    .btn-ya { display: inline-block; padding: 11px 24px; background: #ffcc00; color: #000;
              text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 0.95rem; }
    .btn-ya:hover { background: #f0c000; }
    input[type=text] { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px;
                       font-size: 1rem; margin: 8px 0 12px; }
    button[type=submit] { padding: 10px 24px; background: #111; color: #fff; border: none;
                          border-radius: 4px; font-size: 0.95rem; cursor: pointer; }
    button[type=submit]:hover { background: #333; }
    .ok  { color: #2a7a2a; font-weight: bold; }
    .err { color: #a00; font-weight: bold; }
    .to-admin { display: inline-block; margin-top: 16px; padding: 10px 24px;
                background: #111; color: #fff; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
<div class="box">
  <h2>Подключение Яндекс Метрики</h2>

  <?php if (!empty($success)): ?>
    <p class="ok">✅ Токен получен и сохранён! Метрика подключена к админке.</p>
    <a href="https://api.phicandles.ru/admin.php" class="to-admin">Перейти в админку →</a>

  <?php elseif ($already): ?>
    <p class="ok">✅ Токен уже сохранён — Метрика подключена.</p>
    <a href="https://api.phicandles.ru/admin.php" class="to-admin">Перейти в админку →</a>
    <p style="margin-top:16px;font-size:0.85rem;color:#999;">Если токен истёк — пройди авторизацию заново:</p>
    <a href="<?= $auth_url ?>" class="btn-ya" target="_blank">Обновить токен</a>

  <?php else: ?>

    <div class="step">
      <div class="step-num">Шаг 1</div>
      <p>Нажми кнопку — откроется страница Яндекса, где покажут <strong>код подтверждения</strong>. Скопируй его.</p>
      <a href="<?= $auth_url ?>" class="btn-ya" target="_blank">Открыть Яндекс →</a>
    </div>

    <div class="step">
      <div class="step-num">Шаг 2</div>
      <p>Вставь скопированный код сюда и нажми «Сохранить»:</p>
      <?php if (!empty($error)): ?>
        <p class="err">Ошибка: <?= htmlspecialchars($error) ?></p>
      <?php endif; ?>
      <form method="post">
        <input type="text" name="code" placeholder="Вставь код из Яндекса" required autofocus>
        <button type="submit">Сохранить токен</button>
      </form>
    </div>

  <?php endif; ?>
</div>
</body>
</html>
