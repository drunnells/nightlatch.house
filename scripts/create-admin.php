<?php

require dirname(__DIR__) . '/app/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

if ($argc < 4) {
    fwrite(STDERR, "Usage: php scripts/create-admin.php email display-name password\n");
    exit(1);
}

$email = strtolower(trim($argv[1]));
$displayName = trim($argv[2]);
$password = $argv[3];

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "A valid email address is required.\n");
    exit(1);
}
if (strlen($password) < 12) {
    fwrite(STDERR, "Passwords must contain at least 12 characters.\n");
    exit(1);
}

$stmt = nightlatch_db()->prepare(
    'INSERT INTO admin_users (email, display_name, password_hash) VALUES (?, ?, ?)'
);
$stmt->execute(array($email, $displayName, password_hash($password, PASSWORD_DEFAULT)));

fwrite(STDOUT, "Admin created for " . $email . ".\n");

