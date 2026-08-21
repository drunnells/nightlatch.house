<?php

/**
 * Validation for the declarative room/object interaction format.
 * Draft values may be blank, but shapes, supported types, nesting, and sizes are constrained.
 */

function nightlatch_logic_string($value, $maximum, $label)
{
    if ($value !== null && !is_string($value) && !is_numeric($value)) {
        throw new RuntimeException($label . ' must be text.');
    }
    $text = (string) $value;
    if (strlen($text) > $maximum) {
        throw new RuntimeException($label . ' is too long.');
    }
}

function nightlatch_validate_condition_expression($expression, $depth, &$conditionCount)
{
    if (!is_array($expression)) {
        throw new RuntimeException('Every logic condition must be an object.');
    }
    $type = isset($expression['type']) ? $expression['type'] : '';
    if ($type === 'group') {
        if ($depth > 2) {
            throw new RuntimeException('Condition groups may be nested at most three levels deep.');
        }
        $match = isset($expression['match']) ? $expression['match'] : 'all';
        if (!in_array($match, array('all', 'any'), true)) {
            throw new RuntimeException('Condition groups must match ALL or ANY conditions.');
        }
        $children = isset($expression['children']) ? $expression['children'] : array();
        if (!is_array($children)) {
            throw new RuntimeException('A condition group must contain a condition list.');
        }
        foreach ($children as $child) {
            nightlatch_validate_condition_expression($child, $depth + 1, $conditionCount);
        }
        return;
    }
    if ($type !== 'condition') {
        throw new RuntimeException('Unsupported condition type.');
    }
    $conditionCount++;
    if ($conditionCount > 25) {
        throw new RuntimeException('A logic branch may contain at most 25 conditions.');
    }
    $source = isset($expression['source']) ? $expression['source'] : '';
    $operator = isset($expression['operator']) ? $expression['operator'] : '';
    if (!in_array($source, array('flag', 'item'), true)) {
        throw new RuntimeException('Conditions may inspect only flags or inventory items.');
    }
    if (!in_array($operator, array('equals', 'not_equals', 'exists', 'not_exists'), true)) {
        throw new RuntimeException('Unsupported condition comparison.');
    }
    nightlatch_logic_string(isset($expression['key']) ? $expression['key'] : '', 190, 'Condition key');
    nightlatch_logic_string(isset($expression['value']) ? $expression['value'] : '', 1000, 'Condition value');
}

function nightlatch_validate_logic_actions($actions, $contentKind, $regionKind)
{
    if (!is_array($actions)) {
        throw new RuntimeException('Branch results must be a list.');
    }
    if (count($actions) > 25) {
        throw new RuntimeException('A logic branch may contain at most 25 results.');
    }
    $allowed = array('message', 'set_overlay', 'clear_overlay', 'set_flag', 'clear_flag', 'grant_item', 'remove_item', 'unlock_door', 'examine_object', 'set_description', 'play_sound');
    foreach ($actions as $action) {
        if (!is_array($action)) {
            throw new RuntimeException('Every branch result must be an object.');
        }
        $type = isset($action['type']) ? $action['type'] : '';
        if (!in_array($type, $allowed, true)) {
            throw new RuntimeException('Unsupported branch result type.');
        }
        if ($type === 'message') {
            nightlatch_logic_string(isset($action['text']) ? $action['text'] : '', 4000, 'Player message');
        } elseif ($type === 'set_overlay') {
            nightlatch_logic_string(isset($action['asset']) ? $action['asset'] : '', 2048, 'Overlay asset');
            nightlatch_logic_string(isset($action['prompt']) ? $action['prompt'] : '', 2000, 'Overlay prompt');
        } elseif ($type === 'set_flag') {
            nightlatch_logic_string(isset($action['key']) ? $action['key'] : '', 190, 'Flag key');
            nightlatch_logic_string(isset($action['value']) ? $action['value'] : '', 1000, 'Flag value');
        } elseif (in_array($type, array('clear_flag', 'grant_item', 'remove_item'), true)) {
            nightlatch_logic_string(isset($action['key']) ? $action['key'] : '', 190, 'State key');
        } elseif ($type === 'unlock_door' && ($contentKind !== 'room' || $regionKind !== 'door')) {
            throw new RuntimeException('Only room door regions may use the unlock-door result.');
        } elseif ($type === 'examine_object') {
            if ($contentKind !== 'room') {
                throw new RuntimeException('Only room regions may open another object.');
            }
            nightlatch_logic_string(isset($action['objectSlug']) ? $action['objectSlug'] : '', 190, 'Object slug');
        } elseif ($type === 'set_description') {
            $targetKind = isset($action['targetKind']) ? $action['targetKind'] : '';
            if (!in_array($targetKind, array('room', 'object'), true)) {
                throw new RuntimeException('Description results must target a room or object.');
            }
            nightlatch_logic_string(isset($action['targetSlug']) ? $action['targetSlug'] : '', 190, 'Description target slug');
            nightlatch_logic_string(isset($action['text']) ? $action['text'] : '', 8000, 'Player description');
        } elseif ($type === 'play_sound') {
            nightlatch_logic_string(isset($action['soundSlug']) ? $action['soundSlug'] : '', 190, 'Sound slug');
        }
    }
}

function nightlatch_validate_region_logic($logic, $contentKind, $regionKind)
{
    if (!is_array($logic)) {
        throw new RuntimeException('Region logic must be an object.');
    }
    $branches = isset($logic['branches']) ? $logic['branches'] : array();
    if (!is_array($branches) || !$branches || count($branches) > 10) {
        throw new RuntimeException('Region logic must contain between 1 and 10 IF / ELSE IF branches.');
    }
    foreach ($branches as $branch) {
        if (!is_array($branch)) {
            throw new RuntimeException('Every logic branch must be an object.');
        }
        $conditionCount = 0;
        nightlatch_validate_condition_expression(isset($branch['when']) ? $branch['when'] : array(), 0, $conditionCount);
        nightlatch_validate_logic_actions(isset($branch['actions']) ? $branch['actions'] : array(), $contentKind, $regionKind);
    }
    nightlatch_validate_logic_actions(isset($logic['elseActions']) ? $logic['elseActions'] : array(), $contentKind, $regionKind);
}

function nightlatch_validate_interactive_data($data, $contentKind)
{
    if (!is_array($data)) {
        throw new RuntimeException('Interactive content data must be an object.');
    }
    $regions = isset($data['regions']) ? $data['regions'] : array();
    $version = isset($data['version']) ? (int) $data['version'] : 1;
    if (!is_array($regions) || count($regions) > 250) {
        throw new RuntimeException('Interactive content may contain at most 250 regions.');
    }
    foreach ($regions as $region) {
        if (!is_array($region)) {
            throw new RuntimeException('Every interactive region must be an object.');
        }
        $regionKind = isset($region['kind']) ? $region['kind'] : 'interaction';
        if (!in_array($regionKind, array('interaction', 'door'), true) || ($contentKind === 'object' && $regionKind !== 'interaction')) {
            throw new RuntimeException('Invalid interactive region type.');
        }
        if ($version >= 2 && !isset($region['logic'])) {
            throw new RuntimeException('Version 2 regions must contain branch logic.');
        }
        if (isset($region['logic'])) {
            nightlatch_validate_region_logic($region['logic'], $contentKind, $regionKind);
        }
        if (isset($region['overlayLibrary'])) {
            if (!is_array($region['overlayLibrary']) || count($region['overlayLibrary']) > 100) {
                throw new RuntimeException('A region overlay library must contain at most 100 images.');
            }
            foreach ($region['overlayLibrary'] as $overlay) {
                if (is_string($overlay)) {
                    nightlatch_logic_string($overlay, 2048, 'Saved overlay asset');
                    continue;
                }
                if (!is_array($overlay)) {
                    throw new RuntimeException('Every saved region overlay must be an object.');
                }
                nightlatch_logic_string(isset($overlay['asset']) ? $overlay['asset'] : '', 2048, 'Saved overlay asset');
                nightlatch_logic_string(isset($overlay['prompt']) ? $overlay['prompt'] : '', 2000, 'Saved overlay prompt');
                nightlatch_logic_string(isset($overlay['source']) ? $overlay['source'] : '', 40, 'Saved overlay source');
            }
        }
    }
    return $data;
}
