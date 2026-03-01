package email

const MagicLinkEmailTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connexion Photo Cloud</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #6200ee;
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .content {
            padding: 40px 30px;
            text-align: center;
            color: #333333;
        }
        .content p {
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 30px;
        }
        .button {
            display: inline-block;
            background-color: #6200ee;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
        }
        .footer {
            padding: 20px;
            text-align: center;
            color: #999999;
            font-size: 12px;
            background-color: #fafafa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Photo Cloud</h1>
        </div>
        <div class="content">
            <p>Bonjour,<br><br>Cliquez sur le bouton ci-dessous pour vous connecter à votre compte Photo Cloud. Ce lien expirera dans 15 minutes.</p>
            <a href="%s" class="button">Se connecter</a>
            <p style="margin-top: 30px; font-size: 14px; color: #666;">Si le bouton ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur :<br>
            <span style="word-break: break-all; color: #6200ee;">%s</span></p>
        </div>
        <div class="footer">
            &copy; 2024 Photo Cloud. Votre galerie privée à petit prix.
        </div>
    </div>
</body>
</html>
`
