<?php
require dirname(__DIR__) . '/app/bootstrap.php';

if (nightlatch_admin()) {
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        nightlatch_verify_csrf();
        $email = strtolower(trim(isset($_POST['email']) ? $_POST['email'] : ''));
        $password = isset($_POST['password']) ? $_POST['password'] : '';
        $stmt = nightlatch_db()->prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1 LIMIT 1');
        $stmt->execute(array($email));
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            usleep(350000);
            throw new RuntimeException('Email or password was not recognized.');
        }

        session_regenerate_id(true);
        $_SESSION['admin'] = array(
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'display_name' => $user['display_name'],
        );
        nightlatch_db()->prepare('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?')->execute(array($user['id']));
        header('Location: index.php');
        exit;
    } catch (Throwable $exception) {
        $error = $exception instanceof PDOException
            ? 'The admin database is not ready. Apply the database update and verify your local config.'
            : $exception->getMessage();
    }
}

$pageTitle = 'Sign in · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="login-shell">
    <div class="login-art" aria-hidden="true">
        <div class="moon"></div>
        <div class="house-silhouette">
            <span class="window"></span>
            <span class="door"></span>
        </div>
        <div class="fog fog-one"></div>
        <div class="fog fog-two"></div>
        <p>Every lock remembers.</p>
    </div>
    <div class="login-panel">
        <div class="eyebrow">Authorized personnel only</div>
        <h1>Enter the house</h1>
        <p class="muted">Sign in to build rooms, wire puzzles, and test the path through Nightlatch House.</p>
        <?php if ($error): ?><div class="alert nl-alert"><i class="fa-solid fa-triangle-exclamation"></i> <?php echo nightlatch_h($error); ?></div><?php endif; ?>
        <form method="post" class="nl-form">
            <input type="hidden" name="csrf_token" value="<?php echo nightlatch_h(nightlatch_csrf_token()); ?>">
            <label for="email">Email</label>
            <div class="input-icon"><i class="fa-regular fa-envelope"></i><input id="email" name="email" type="email" autocomplete="username" required autofocus></div>
            <label for="password">Password</label>
            <div class="input-icon"><i class="fa-solid fa-lock"></i><input id="password" name="password" type="password" autocomplete="current-password" required></div>
            <button class="btn-forge btn-block" type="submit">Unlock admin <i class="fa-solid fa-arrow-right"></i></button>
        </form>
        <p class="login-help">First visit? Create the initial account with <code>php scripts/create-admin.php</code>.</p>
    </div>
</section>
<?php require __DIR__ . '/_footer.php'; ?>

