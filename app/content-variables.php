<?php

/**
 * Builds a catalog of string-valued flags referenced by saved room/object logic.
 */

function nightlatch_collect_condition_flag_keys($expression, &$uses)
{
    if (!is_array($expression)) {
        return;
    }
    if (isset($expression['type']) && $expression['type'] === 'group') {
        $children = isset($expression['children']) && is_array($expression['children']) ? $expression['children'] : array();
        foreach ($children as $child) {
            nightlatch_collect_condition_flag_keys($child, $uses);
        }
        return;
    }
    if (isset($expression['source']) && $expression['source'] === 'flag') {
        $key = trim(isset($expression['key']) ? (string) $expression['key'] : '');
        if ($key !== '') {
            if (!isset($uses[$key])) $uses[$key] = array();
            $uses[$key]['condition'] = true;
        }
    }
}

function nightlatch_collect_action_flag_keys($actions, &$uses)
{
    if (!is_array($actions)) {
        return;
    }
    foreach ($actions as $action) {
        if (!is_array($action)) continue;
        $type = isset($action['type']) ? $action['type'] : '';
        if (!in_array($type, array('set_flag', 'clear_flag'), true)) continue;
        $key = trim(isset($action['key']) ? (string) $action['key'] : '');
        if ($key === '') continue;
        if (!isset($uses[$key])) $uses[$key] = array();
        $uses[$key][$type === 'set_flag' ? 'set' : 'clear'] = true;
    }
}

function nightlatch_region_flag_uses($region)
{
    $uses = array();
    if (isset($region['logic']['branches']) && is_array($region['logic']['branches'])) {
        foreach ($region['logic']['branches'] as $branch) {
            if (!is_array($branch)) continue;
            nightlatch_collect_condition_flag_keys(isset($branch['when']) ? $branch['when'] : array(), $uses);
            nightlatch_collect_action_flag_keys(isset($branch['actions']) ? $branch['actions'] : array(), $uses);
        }
        nightlatch_collect_action_flag_keys(isset($region['logic']['elseActions']) ? $region['logic']['elseActions'] : array(), $uses);
        return $uses;
    }

    nightlatch_collect_condition_flag_keys(isset($region['condition']) ? $region['condition'] : array(), $uses);
    foreach (array('success', 'failure') as $outcomeName) {
        $outcome = isset($region[$outcomeName]) && is_array($region[$outcomeName]) ? $region[$outcomeName] : array();
        if (isset($outcome['setFlag']['key'])) {
            $key = trim((string) $outcome['setFlag']['key']);
            if ($key !== '') {
                if (!isset($uses[$key])) $uses[$key] = array();
                $uses[$key]['set'] = true;
            }
        }
    }
    return $uses;
}

function nightlatch_add_content_flags(&$catalog, $contentKind, $row, $dataField)
{
    $data = nightlatch_interactive_content_data(isset($row[$dataField]) ? $row[$dataField] : '');
    foreach ($data['regions'] as $regionIndex => $region) {
        if (!is_array($region)) continue;
        $uses = nightlatch_region_flag_uses($region);
        foreach ($uses as $key => $usageMap) {
            if (!isset($catalog[$key])) {
                $catalog[$key] = array('key' => $key, 'references' => array());
            }
            $catalog[$key]['references'][] = array(
                'contentKind' => $contentKind,
                'contentId' => (int) $row['id'],
                'contentTitle' => $row['title'],
                'contentSlug' => $row['slug'],
                'regionId' => isset($region['id']) ? (string) $region['id'] : 'region-' . ($regionIndex + 1),
                'regionName' => isset($region['name']) && $region['name'] !== '' ? $region['name'] : 'Region ' . ($regionIndex + 1),
                'usages' => array_keys($usageMap),
            );
        }
    }
}

function nightlatch_flag_catalog()
{
    $catalog = array();
    $rooms = nightlatch_db()->query('SELECT id, title, slug, room_data FROM rooms ORDER BY title')->fetchAll();
    foreach ($rooms as $room) {
        nightlatch_add_content_flags($catalog, 'room', $room, 'room_data');
    }
    $objects = nightlatch_db()->query('SELECT id, title, slug, object_data FROM objects ORDER BY title')->fetchAll();
    foreach ($objects as $object) {
        nightlatch_add_content_flags($catalog, 'object', $object, 'object_data');
    }
    ksort($catalog, SORT_NATURAL | SORT_FLAG_CASE);
    return array_values($catalog);
}
