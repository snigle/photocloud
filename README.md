Compte-rendu : App de stockage photo Cloud Low-Cost
1. Vision Globale

Application de stockage photo type Google Photos avec coût d'infrastructure proche de zéro.

• Backend : Go (léger, orchestrateur).

• Stockage : OVH S3 (Public Cloud).

• Mindset : Pas de base de données centrale (No-DB).

2. Architecture Technique

• Auth : Google, FranceConnect, Magic Links (via SMTP OVH gratuit).

• Accès S3 : L'API Go génère des credentials IAM spécifiques par utilisateur à la volée.

• Scope : Accès restreint par préfixe (`/users/user-id/*`) via Policy S3.

• Stockage Local : Les clés S3 sont stockées sur l'appareil (LocalStorage/Cookie).

3. Gestion des Albums & Partage

• Albums : Fichiers `index.json` sur S3 (pas de duplication d'images).

• Partage Privé : URLs présignées (Presigned URLs) générées par l'API Go.

• Validité : 7 jours pour minimiser la charge sur le backend.

• Révocation : Suppression virtuelle via l'index JSON.

4. Optimisation & Coûts

• Bande passante : Gratuite en sortie chez OVH S3.

• Scalabilité : Signature HMAC ultra-rapide en Go (supporte >100k users sur un petit VPS ou Serverless).

• Metadata : Stockées directement dans les tags/metadata S3 ou le JSON d'index.

## 5. Guide de Lancement (API Backend)

### Pré-requis
- Go 1.16+
- Un compte OVHcloud avec un projet Public Cloud.
- Un bucket S3 créé sur OVHcloud.

### Variables d'Environnement
Créez un fichier `.env` ou exportez les variables suivantes :

```bash
# Configuration OVH Cloud
export OVH_ENDPOINT=ovh-eu
export OVH_APPLICATION_KEY=your_app_key
export OVH_APPLICATION_SECRET=your_app_secret
export OVH_CONSUMER_KEY=your_consumer_key
export OVH_PROJECT_ID=your_project_id
export OVH_REGION=gra
export OVH_S3_BUCKET=your_photocloud_bucket

# Configuration Authentification
export GOOGLE_CLIENT_ID=your_google_client_id
export JWT_SECRET=your_magic_link_jwt_secret
export RP_ID=localhost
export RP_ORIGIN=http://localhost:3000

# Configuration SMTP (Magic Link)
export SMTP_HOST=ssl0.ovh.net
export SMTP_PORT=587
export SMTP_USER=your_email@domain.com
export SMTP_PASS=your_password
export SMTP_FROM=your_email@domain.com

# Configuration API
export PORT=8080
export API_URL=http://localhost:8080
```

### Lancement
```bash
# Installation des dépendances
go mod tidy

# Lancement du serveur
go run cmd/api/main.go
```

### Endpoints principaux
- `GET /auth/google?token=ID_TOKEN` : Login via Google.
- `GET /auth/magic-link/request?email=USER_EMAIL` : Demander un lien magique.
- `GET /auth/passkey/login/begin?email=USER_EMAIL` : Initier un login Passkey.
- `GET /credentials` : Récupérer les clés S3 (nécessite header `X-User-Email` pour le POC).
