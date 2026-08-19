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

/**
 * Build a precision image-editing request with an inline reference image.
 */
function nightlatch_gemini_image_edit_request($prompt, $imageBytes, $mimeType)
{
    return array(
        'contents' => array(array('parts' => array(
            array('text' => $prompt),
            array('inlineData' => array(
                'mimeType' => $mimeType,
                'data' => base64_encode($imageBytes),
            )),
        ))),
        'generationConfig' => array(
            'responseModalities' => array('IMAGE'),
            'imageConfig' => array(
                'aspectRatio' => '1:1',
                'imageSize' => '1K',
            ),
        ),
    );
}
