<?php
// Простой роутер для SPA
$request_uri = $_SERVER['REQUEST_URI'];
$file_path = __DIR__ . $request_uri;

if (file_exists($file_path) && is_file($file_path)) {
    // Отдаем статический файл
    $mime_types = [
        'js' => 'application/javascript',
        'css' => 'text/css',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'svg' => 'image/svg+xml',
        'ico' => 'image/x-icon'
    ];
    
    $ext = pathinfo($file_path, PATHINFO_EXTENSION);
    if (isset($mime_types[$ext])) {
        header('Content-Type: ' . $mime_types[$ext]);
    }
    
    readfile($file_path);
    exit;
}

// Для API запросов
if (strpos($request_uri, '/api/') === 0) {
    // Проксируем на Node.js сервер
    $api_url = 'http://localhost:3001' . $request_uri;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $api_url);
    curl_setopt($ch, CURLOPT_POST, $_SERVER['REQUEST_METHOD'] !== 'GET');
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json'
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($http_code);
    echo $response;
    exit;
}

// Для всех остальных запросов отдаем index.html
header('Content-Type: text/html');
readfile(__DIR__ . '/index.html');
