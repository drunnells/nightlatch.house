<?php

require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/sounds.php';

if (nightlatch_sound_name_from_filename('old-house_door-creak.mp3') !== 'Old House Door Creak') {
    fwrite(STDERR, "Sound filenames were not converted into editable names.\n");
    exit(1);
}
if (nightlatch_sound_extension_for_mime('audio/mpeg') !== 'mp3'
    || nightlatch_sound_extension_for_mime('audio/x-wav') !== 'wav'
    || nightlatch_sound_extension_for_mime('application/octet-stream') !== '') {
    fwrite(STDERR, "Sound MIME validation is incorrect.\n");
    exit(1);
}
$expectedPath = NIGHTLATCH_ROOT . '/assets/sounds/uploads/sample.mp3';
if (nightlatch_sound_local_path('../assets/sounds/uploads/sample.mp3') !== $expectedPath
    || nightlatch_sound_local_path('../assets/sounds/uploads/../sample.mp3') !== '') {
    fwrite(STDERR, "Sound asset paths were not constrained to the upload directory.\n");
    exit(1);
}

fwrite(STDOUT, "sound-library tests passed\n");
