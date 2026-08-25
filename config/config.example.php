<?php

/**
 * Nightlatch House configuration template.
 *
 * Copy this file to config/config.php for local development and replace the
 * placeholder values there. The real config/config.php file must stay private.
 */
 return array(
   'environment' => array(
     'name' => 'dev',
     'debug' => true,
     'base_url' => 'http://localhost/nightlatch.house-dev',
   ),

   'database' => array(
     'mysql' => array(
       'host' => '127.0.0.1',
       'port' => 3306,
       'database' => 'nightlatch_house',
       'username' => 'nightlatch_user',
       'password' => 'replace-with-local-password',
       'charset' => 'utf8mb4',
     ),
   ),

   'ai' => array(
     'google_gemini' => array(
       'api_key' => 'replace-with-google-gemini-api-key',
       'model' => 'gemini-3.1-flash-image',
     ),
     'openai' => array(
       'api_key' => 'replace-with-openai-api-key',
       'model' => 'openai-placeholder-model',
     ),
   ),

   'assets' => array(
     'graphics_path' => 'assets/graphics',
     'animations_path' => 'assets/animations',
     'sounds_path' => 'assets/sounds',
   ),

   's3' => array(
     // Uploads use the regional origin endpoint, never the .cdn. hostname.
     's3_endpoint'           => '',
     // Browser assets use the bucket-specific CDN base URL.
     's3_object_baseurl'     => '',
     's3_bucket'             => '',
     's3_region'             => '',
     's3_key'                => '',
     's3_secret'             => '',
     's3_acl'                => 'public-read',
   ),

 );
