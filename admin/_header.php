<?php
$pageTitle = isset($pageTitle) ? $pageTitle : 'Nightlatch Admin';
$admin = nightlatch_admin();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo nightlatch_h($pageTitle); ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="<?php echo nightlatch_h(nightlatch_asset('css/admin.css')); ?>">
    <script src="<?php echo nightlatch_h(nightlatch_asset('js/jquery-3.7.1.min.js')); ?>"></script>
</head>
<body>
<header class="admin-header">
    <a class="brand" href="index.php" aria-label="Nightlatch House admin home">
        <span class="brand-mark"><i class="fa-solid fa-key"></i></span>
        <span><strong>NIGHTLATCH</strong><small>ROOM FORGE</small></span>
    </a>
    <?php if ($admin): ?>
        <nav class="admin-nav" aria-label="Admin navigation">
            <a href="index.php"><i class="fa-solid fa-door-open"></i> Rooms</a>
            <a href="map.php"><i class="fa-solid fa-circle-nodes"></i> Map</a>
            <a href="objects.php"><i class="fa-solid fa-magnifying-glass"></i> Objects</a>
            <a href="flags.php"><i class="fa-solid fa-flag"></i> Flags</a>
            <a href="admins.php"><i class="fa-solid fa-user-shield"></i> Admins</a>
        </nav>
        <div class="admin-account">
            <span class="status-dot"></span>
            <span><?php echo nightlatch_h($admin['display_name']); ?></span>
            <a href="logout.php" title="Sign out" aria-label="Sign out"><i class="fa-solid fa-arrow-right-from-bracket"></i></a>
        </div>
    <?php endif; ?>
</header>
<main class="admin-main">
