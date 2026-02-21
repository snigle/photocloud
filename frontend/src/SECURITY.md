# 🛡️ Stratégie de Chiffrement & Sécurité (No-DB Architecture)

Ce document décrit le mécanisme de protection des données utilisateur pour l'application. L'objectif est de garantir qu'un administrateur S3 ne puisse pas visualiser les photos sans une action malveillante complexe, tout en conservant une expérience utilisateur fluide et un partage d'album simple.

## 1. Principes Fondamentaux

* **Zéro Base de Données :** Les clés sont stockées sur S3, protégées par un secret applicatif.
* **S3 SSE-C :** Utilisation du chiffrement côté serveur avec clés fournies par le client (*Server-Side Encryption with Customer-Provided Keys*).
* **Double Verrou :** La sécurité repose sur l'isolation **IAM** (qui a accès au fichier) + le **Chiffrement** (lecture du contenu).

---

## 2. Le Trousseau de Clés

| Composant | Type | Emplacement | Rôle |
| --- | --- | --- | --- |
| **App Master Key** | AES-256 | Variable d'env (API Go) | Chiffre/Déchiffre les clés individuelles des utilisateurs. |
| **User AES Key** | AES-256 | `s3://bucket/{user_id}/key.enc` | Clé unique par utilisateur utilisée pour le SSE-C de S3. |

---

## 3. Workflows Techniques

### A. Initialisation d'un Utilisateur

Lors de la première authentification (Google/FranceConnect) :

1. L'API génère une `User_AES_Key` aléatoire.
2. L'API la chiffre en utilisant la `App Master Key`.
3. Le résultat est stocké dans le dossier racine de l'utilisateur sur S3.

### B. Upload d'une Photo

1. Le Frontend envoie l'image brute à l'API via un stream.
2. L'API récupère et déchiffre la `User_AES_Key` du dossier utilisateur.
3. L'API envoie le fichier vers S3 avec les headers SSE-C :
* `x-amz-server-side-encryption-customer-algorithm`: `AES256`
* `x-amz-server-side-encryption-customer-key`: `[User_AES_Key]`



### C. Récupération & Partage

1. **L'utilisateur propriétaire :** L'API génère une URL présignée incluant les headers de déchiffrement SSE-C.
2. **Partage d'Album :** - L'accès physique au fichier est autorisé via une **Policy IAM** temporaire ou une URL présignée.
* L'API utilise la même `User_AES_Key` pour le déchiffrement.
* *Note :* La sécurité du partage repose sur la capacité de l'API à restreindre la génération de liens uniquement aux photos autorisées.



---

## 4. Sécurité vis-à-vis de l'Administrateur

| Scénario | Résultat | Pourquoi ? |
| --- | --- | --- |
| **Admin parcourt le S3** | ❌ **Échec** | Les photos apparaissent comme des fichiers binaires illisibles. |
| **Admin vole la clé chiffrée** | ❌ **Échec** | Le fichier `key.enc` ne peut être ouvert qu'avec la `App Master Key` (absente de S3). |
| **Accès total (S3 + API)** | ⚠️ **Risque** | Un accès aux variables d'environnement de l'API permettrait de tout déchiffrer. |

---

## 5. Implémentation Go (Pseudo-code)

```go
// Exemple d'upload avec SSE-C
func UploadToS3(userKey []byte, file io.Reader, bucket, key string) {
    s3.PutObject(&s3.PutObjectInput{
        Bucket: aws.String(bucket),
        Key:    aws.String(key),
        Body:   file,
        SSECustomerAlgorithm: aws.String("AES256"),
        SSECustomerKey:       aws.String(string(userKey)), // La clé déchiffrée par l'API
    })
}

```

---

## 6. Évolution future

Pour renforcer encore la sécurité sans impacter l'UX :

* **Clé par Album :** Générer une clé AES différente par dossier d'album pour isoler totalement les accès en cas de partage.
* **Rotation :** Prévoir un script de rotation de la `App Master Key`.

