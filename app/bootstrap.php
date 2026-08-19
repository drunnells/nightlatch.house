<?php

/**
 * Shared application bootstrap. PHP 7.x compatible.
 */

define('NIGHTLATCH_ROOT', dirname(__DIR__));

if (session_status() !== PHP_SESSION_ACTIVE) {
    $secureCookie = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array(
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => $secureCookie,
        ));
    } else {
        session_set_cookie_params(0, '/', '', $secureCookie, true);
    }
    session_start();
}

function nightlatch_config()
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $path = NIGHTLATCH_ROOT . '/config/config.php';
    if (!is_file($path)) {
        throw new RuntimeException('Local configuration is missing. Copy config/config.example.php to config/config.php and add local values.');
    }

    $config = require $path;
    if (!is_array($config)) {
        throw new RuntimeException('Configuration must return an array.');
    }

    return $config;
}

function nightlatch_db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = nightlatch_config();
    $mysql = $config['database']['mysql'];
    $charset = isset($mysql['charset']) ? $mysql['charset'] : 'utf8mb4';
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $mysql['host'],
        $mysql['port'],
        $mysql['database'],
        $charset
    );

    $pdo = new PDO($dsn, $mysql['username'], $mysql['password'], array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ));

    return $pdo;
}

function nightlatch_csrf_token()
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function nightlatch_verify_csrf()
{
    $token = isset($_POST['csrf_token']) ? $_POST['csrf_token'] : '';
    if (!$token && isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'];
    }
    if (!$token || !hash_equals(nightlatch_csrf_token(), $token)) {
        throw new RuntimeException('The form expired. Refresh the page and try again.');
    }
}

function nightlatch_admin()
{
    return isset($_SESSION['admin']) && is_array($_SESSION['admin']) ? $_SESSION['admin'] : null;
}

function nightlatch_require_admin($json = false)
{
    if (nightlatch_admin()) {
        return;
    }
    if ($json) {
        nightlatch_json(array('ok' => false, 'error' => 'Authentication required.'), 401);
    }
    header('Location: login.php');
    exit;
}

function nightlatch_json($payload, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function nightlatch_input_json()
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        nightlatch_json(array('ok' => false, 'error' => 'Invalid JSON request.'), 400);
    }
    return $data;
}

function nightlatch_slug($value)
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value);
    return trim($value, '-');
}

function nightlatch_h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function nightlatch_room_payload($row)
{
    $data = json_decode($row['room_data'], true);
    if (!is_array($data)) {
        $data = array();
    }
    if (!isset($data['canvas']) || !is_array($data['canvas'])) {
        $data['canvas'] = array('width' => 1600, 'height' => 900);
    }
    if (!isset($data['regions']) || !is_array($data['regions'])) {
        $data['regions'] = array();
    }
    if (!isset($data['version'])) {
        $data['version'] = 1;
    }
    return array(
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'slug' => $row['slug'],
        'description' => $row['description'],
        'status' => $row['status'],
        'backgroundAsset' => $row['background_asset'],
        'backgroundPrompt' => $row['background_prompt'],
        'data' => $data,
        'updatedAt' => $row['updated_at'],
    );
}
