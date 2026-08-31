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
            <a href="sounds.php"><i class="fa-solid fa-volume-high"></i> Sounds</a>
            <a href="admins.php"><i class="fa-solid fa-user-shield"></i> Admins</a>
        </nav>
        <div class="admin-account">
            <button type="button" class="agent-session-button" id="agent-session-launch" title="Connect a local world-building agent"><i class="fa-solid fa-wand-magic-sparkles"></i> Agent session</button>
            <span class="status-dot"></span>
            <span><?php echo nightlatch_h($admin['display_name']); ?></span>
            <a href="logout.php" title="Sign out" aria-label="Sign out"><i class="fa-solid fa-arrow-right-from-bracket"></i></a>
        </div>
    <?php endif; ?>
</header>
<aside class="agent-session" id="agent-session" hidden aria-label="World-building agent session">
    <header><div><span class="eyebrow">Local world builder</span><h2>Agent session</h2></div><button type="button" class="icon-button" id="agent-session-close" aria-label="Close agent session"><i class="fa-solid fa-xmark"></i></button></header>
    <p class="hint">Pair a local MCP server. The agent can edit the open draft, but you approve saves, discards, and image generation here.</p>
    <label for="agent-bridge-url">Local bridge URL</label><input id="agent-bridge-url" value="ws://127.0.0.1:8321" inputmode="url" autocomplete="off">
    <label for="agent-pairing-code">Pairing code</label><input id="agent-pairing-code" placeholder="Paste the code from the agent" autocomplete="off">
    <button type="button" class="btn-forge btn-block" id="agent-session-connect"><i class="fa-solid fa-plug"></i> Connect local agent</button>
    <div class="agent-session-state" id="agent-session-state" aria-live="polite">Not connected</div>
    <div class="agent-session-page" id="agent-session-page">Open a room or object editor to begin.</div>
    <div class="agent-session-approval" id="agent-session-approval" hidden></div>
    <ol class="agent-session-log" id="agent-session-log" aria-label="Agent session activity"></ol>
</aside>
<main class="admin-main">
