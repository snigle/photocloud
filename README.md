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
