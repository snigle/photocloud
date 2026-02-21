# Instructions de Développement : Architecture Propre & Testable

Ce document définit les standards de code pour le projet "Photo Cloud S3". L'objectif est de garantir un code facile à maintenir, à tester et à débugger, en limitant l'adhérence aux services externes (S3, OVH, Google Auth).

## 1. Philosophie Générale
- **Séparation des préoccupations (SoC) :** La logique métier ne doit jamais savoir qu'elle parle à S3 ou à une API spécifique.
- **Injection de Dépendances :** Tout service externe doit être injecté via une interface.
- **Fail Fast :** Valider les entrées le plus tôt possible.

## 2. Architecture Backend (Go)
Le code doit suivre une structure par "Domain" :

- `/internal/domain` : Contient les modèles (ex: `User`, `Photo`) et les interfaces (ex: `StorageRepository`). **Zéro dépendance externe ici.**
- `/internal/usecase` : La logique métier (ex: `CreateAlbum`, `GenerateShareLink`). Elle manipule les interfaces du domaine.
- `/internal/infra` : L'implémentation concrète des interfaces.
    - `/infra/ovh` : SDK OVH, IAM, S3.
    - `/infra/auth` : Validation des tokens Google/FranceConnect.
- `/cmd/api` : Point d'entrée, configuration des routes et injection des dépendances.

### Règle d'or Go :
Chaque UseCase doit avoir son propre fichier de test `_test.go` utilisant des "Mocks" pour les interfaces infra.

## 3. Architecture Frontend (React Native)
Structure basée sur les Hooks et les Services :

- `/src/domain` : Types TypeScript et entités.
- `/src/services` : Classes ou fonctions pures pour les appels API et S3. Utiliser un pattern "Repository".
- `/src/hooks` : Logique d'état complexe (ex: `useGallery`, `useS3Upload`). Les composants ne doivent pas gérer la logique S3.
- `/src/components` : Composants "idiots" (Dumb Components) qui ne font que l'affichage.
- `/src/screens` : Assemblage des hooks et des composants.

## 4. Règles de Débugging & Logs
- **Erreurs explicites :** En Go, ne jamais ignorer une erreur. En React, utiliser des Error Boundaries.
- **Logs structurés :** Inclure l'ID de l'utilisateur et l'action en cours dans les logs, mais JAMAIS de secrets (SecretKeys, Tokens).
- **Stateless :** Le backend doit rester stateless. Tout état nécessaire doit être passé via le JWT ou lu sur S3.

## 5. Standards de Test
- **Unit Tests :** Obligatoires pour chaque logique de calcul de signature ou de parsing de l'index JSON.
- **Integration Tests :** Uniquement pour vérifier la connexion réelle au bucket S3 de test.
