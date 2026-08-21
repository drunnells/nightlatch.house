<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require_once dirname(dirname(__DIR__)) . '/app/map-topology.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $topology = isset($payload['topology']) && is_array($payload['topology']) ? $payload['topology'] : array();
    $saved = nightlatch_persist_topology(nightlatch_db(), $topology, (int) nightlatch_admin()['id']);
    nightlatch_json(array('ok' => true, 'topology' => $saved, 'savedAt' => date(DATE_ATOM)));
} catch (PDOException $exception) {
    $message = $exception->getCode() === '23000'
        ? 'The map conflicts with an existing cluster, room, or door connection.'
        : 'The map could not be saved. Confirm that database updates 003, 004, and 005 have been applied.';
    nightlatch_json(array('ok' => false, 'error' => $message), 500);
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 422);
}
