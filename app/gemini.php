<?php

/**
 * Build a Gemini image-generation request without exposing local credentials.
 */
function nightlatch_gemini_image_request($prompt)
{
    return array(
        'contents' => array(array('parts' => array(array('text' => $prompt)))),
        'generationConfig' => array(
            'responseModalities' => array('IMAGE'),
            'imageConfig' => array(
                'aspectRatio' => '16:9',
                'imageSize' => '2K',
            ),
        ),
    );
}

