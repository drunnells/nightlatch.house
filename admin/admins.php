<?php
require dirname(__DIR__) . '/app/bootstrap.php';
nightlatch_require_admin();
$error = '';
$notice = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        nightlatch_verify_csrf();
        $action = isset($_POST['action']) ? $_POST['action'] : '';
        if ($action === 'add') {
            $email = strtolower(trim($_POST['email']));
            $name = trim($_POST['display_name']);
            $password = $_POST['password'];
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$name || strlen($password) < 12) {
                throw new RuntimeException('Use a valid email, display name, and password of at least 12 characters.');
            }
            $stmt = nightlatch_db()->prepare('INSERT INTO admin_users (email, display_name, password_hash) VALUES (?, ?, ?)');
            $stmt->execute(array($email, $name, password_hash($password, PASSWORD_DEFAULT)));
            $notice = 'Admin added.';
        } elseif ($action === 'toggle') {
            $id = (int) $_POST['id'];
            if ($id === (int) nightlatch_admin()['id']) {
                throw new RuntimeException('You cannot disable your own account.');
            }
            nightlatch_db()->prepare('UPDATE admin_users SET is_active = IF(is_active = 1, 0, 1) WHERE id = ?')->execute(array($id));
            $notice = 'Admin access updated.';
        } elseif ($action === 'delete') {
            $id = (int) $_POST['id'];
            if ($id === (int) nightlatch_admin()['id']) {
                throw new RuntimeException('You cannot remove your own account.');
            }
            nightlatch_db()->prepare('DELETE FROM admin_users WHERE id = ?')->execute(array($id));
            $notice = 'Admin removed.';
        }
    } catch (Throwable $exception) {
        $error = $exception instanceof PDOException ? 'That account could not be changed. It may own room records or use an existing email.' : $exception->getMessage();
    }
}

$admins = array();
try { $admins = nightlatch_db()->query('SELECT id, email, display_name, is_active, last_login_at, created_at FROM admin_users ORDER BY display_name')->fetchAll(); } catch (Throwable $exception) { $error = 'Admin accounts could not be loaded.'; }
$pageTitle = 'Admins · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="page-wrap narrow-wrap">
    <div class="page-heading"><div><div class="eyebrow">Access control</div><h1>Admin users</h1><p>These accounts are only for the room-building tools. Player identity can remain separate for a future Firebase integration.</p></div></div>
    <?php if ($error): ?><div class="alert nl-alert"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
    <?php if ($notice): ?><div class="alert nl-success"><?php echo nightlatch_h($notice); ?></div><?php endif; ?>
    <div class="split-panels">
        <section class="panel"><h2>Add an admin</h2><form method="post" class="nl-form"><input type="hidden" name="csrf_token" value="<?php echo nightlatch_h(nightlatch_csrf_token()); ?>"><input type="hidden" name="action" value="add"><label>Display name</label><input name="display_name" required><label>Email</label><input name="email" type="email" required><label>Temporary password</label><input name="password" type="password" minlength="12" required><small>Use at least 12 characters. Share it outside this application.</small><button class="btn-forge" type="submit"><i class="fa-solid fa-user-plus"></i> Add admin</button></form></section>
        <section class="panel admin-list"><h2>Current admins</h2><?php foreach ($admins as $user): ?><div class="admin-row"><div class="avatar"><?php echo nightlatch_h(strtoupper(substr($user['display_name'], 0, 1))); ?></div><div class="admin-meta"><strong><?php echo nightlatch_h($user['display_name']); ?></strong><span><?php echo nightlatch_h($user['email']); ?></span><small><?php echo $user['last_login_at'] ? 'Last signed in ' . nightlatch_h(date('M j, Y', strtotime($user['last_login_at']))) : 'Never signed in'; ?></small></div><span class="access-state <?php echo $user['is_active'] ? 'active' : ''; ?>"><?php echo $user['is_active'] ? 'Active' : 'Disabled'; ?></span><?php if ((int) $user['id'] !== (int) nightlatch_admin()['id']): ?><form method="post"><input type="hidden" name="csrf_token" value="<?php echo nightlatch_h(nightlatch_csrf_token()); ?>"><input type="hidden" name="id" value="<?php echo (int) $user['id']; ?>"><button class="icon-button" name="action" value="toggle" title="Toggle access"><i class="fa-solid fa-power-off"></i></button><button class="icon-button danger" name="action" value="delete" title="Remove admin" onclick="return confirm('Remove this admin account?')"><i class="fa-solid fa-trash"></i></button></form><?php endif; ?></div><?php endforeach; ?></section>
    </div>
</section>
<?php require __DIR__ . '/_footer.php'; ?>

