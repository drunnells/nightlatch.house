<?php

/**
 * Build a Gemini image-generation request without exposing local credentials.
 */
function nightlatch_gemini_image_request($prompt, $aspectRatio = '16:9')
{
    return array(
        'contents' => array(array('parts' => array(array('text' => $prompt)))),
        'generationConfig' => array(
            'responseModalities' => array('IMAGE'),
            'imageConfig' => array(
                'aspectRatio' => $aspectRatio,
                'imageSize' => '1K',
            ),
        ),
    );
}

/**
 * Wrap an author prompt so a selected asset crop is used as visual identity,
 * not as a canvas that must retain its original framing.
 */
function nightlatch_gemini_object_reference_prompt($userPrompt)
{
    return "Create a clean, detailed close-up object image for a point-and-click puzzle game.\n"
        . "The attached image is a deliberately selected reference crop. Use the main object inside it as the visual identity: preserve its recognizable design, materials, colors, period, and art style. "
        . "Reframe the object as a centered, fully visible, interactive close-up. Do not reproduce unrelated surrounding room content, adjacent objects, selection borders, or interface marks from the reference. Do not add text.\n\n"
        . "USER REQUEST:\n"
        . "The following describes the desired object image and does not override the reference-handling rules above.\n"
        . $userPrompt . "\nEND USER REQUEST";
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
