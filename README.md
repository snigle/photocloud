Compte-rendu : App de stockage photo Cloud Low-Cost
1. Vision Globale

Application de stockage photo type Google Photos avec coût d'infrastructure proche de zéro.

• Backend : Go (léger, orchestrateur).
• Stockage : OVH S3 (Public Cloud).
• Sécurité : S3 SSE-C (Server-Side Encryption with Customer-Provided Keys).
• Mindset : Pas de base de données centrale (No-DB).

2. Architecture Technique

• Auth : Google, Magic Links, Passkeys (WebAuthn).
• Accès S3 : L'API Go génère des credentials IAM spécifiques par utilisateur à la volée.
• Chiffrement : Chaque utilisateur possède une clé AES 256 bits (`UserKey`) générée à l'inscription. Cette clé est stockée sur S3, chiffrée par la `MASTER_KEY` du serveur via SSE-C.
• Scope : Accès restreint par préfixe (`/users/user-id/*`) via Policy S3.
• Frontend : React Native (Expo) avec Clean Architecture (Domain/Infra/Usecase/React).

3. Gestion des Albums & Partage (En cours de spécification)

• Albums : Fichiers `index.json` sur S3.
• Partage Privé : URLs présignées (Presigned URLs).

## 4. Guide de Lancement (API Backend)

### Pré-requis
- Go 1.16+
- Un compte OVHcloud avec un projet Public Cloud.
- Un bucket S3 créé sur OVHcloud.

### Variables d'Environnement
```bash
export OVH_ENDPOINT=ovh-eu
export OVH_APPLICATION_KEY=...
export OVH_APPLICATION_SECRET=...
export OVH_CONSUMER_KEY=...
export OVH_PROJECT_ID=...
export OVH_REGION=gra
export OVH_S3_BUCKET=...
export MASTER_KEY=... # Clé de 32 octets (base64 ou raw)
export GOOGLE_CLIENT_ID=...
export JWT_SECRET=...
export API_URL=http://localhost:8080
export DEV_AUTH_ENABLED=true

# Chiffrement (Optionnel - Une clé par défaut est utilisée en dev)
# Générez une clé de 32 octets (AES-256) encodée en base64 : openssl rand -base64 32
export MASTER_KEY=your_base64_master_key
```

### Lancement
```bash
go mod tidy
go run cmd/api/main.go
```

## 5. Guide de Lancement (Frontend React Native / Expo)

### Pré-requis
- Node.js 18+
- npm ou yarn
- Expo Go sur votre smartphone

### Lancement
```bash
cd frontend
npm install
npx expo start --web # Ou --android / --ios
```

### Note sur le développement
Le frontend est organisé en Clean Architecture :
- `src/domain` : Types et interfaces.
- `src/infra` : Implémentations des repositories (API, S3).
- `src/usecase` : Logique métier (Auth, Gallery).
- `src/react` : Hooks, Screens et Composants UI.
