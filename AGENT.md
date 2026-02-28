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

## 4. Workflow de Développement de Feature
1. **Conception :** Définir les interfaces du domaine avant l'implémentation.
2. **Implémentation Backend :** Créer le UseCase et ses tests unitaires.
3. **Implémentation Frontend :** Créer les hooks et les composants.
4. **Tests E2E :** Chaque nouvel écran ou flux majeur doit avoir un test Playwright dans `frontend/e2e/`. Ces tests doivent inclure des captures d'écran (`page.screenshot()`) pour valider l'UI.

## 5. Stratégie de Test
- **Tests Unitaires (Go/Jest) :** Logique métier pure, calculs, transformations de données.
- **Tests d'Intégration :** Vérification des contrats d'interface (ex: Repository vers S3 mocké).
- **Tests E2E (Playwright) :** Parcours utilisateur complets sur le Web. Obligatoires pour chaque PR impactant l'UI. Les screenshots sont archivés en tant qu'artifacts CI.

## 6. Qualité de Code & "Clean Architecture"
- Respecter strictement la séparation Domain/UseCase/Infra.
- Le dossier `domain` ne doit jamais importer de code provenant de `infra` ou `usecase`.
- Favoriser la composition et l'injection de dépendances pour faciliter le mocking.

## 7. Règles de Débugging & Logs
- **Erreurs explicites :** En Go, ne jamais ignorer une erreur. En React, utiliser des Error Boundaries.
- **Logs structurés :** Inclure l'ID de l'utilisateur et l'action en cours dans les logs, mais JAMAIS de secrets (SecretKeys, Tokens).
- **Stateless :** Le backend doit rester stateless. Tout état nécessaire doit être passé via le JWT ou lu sur S3.
