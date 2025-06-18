# Server for exporting messages with images from cache service (KeyDB or Redis) to GCS.

## Getting Started

To run the components locally, follow these steps:

1. Clone the repository
2. Navigate to the project directory
3. Set up `.env` file and forward MQTT service port following [instruction](https://www.notion.so/teknoir/Connect-a-service-in-the-cloud-with-local-development-environment-dff3f37176604d56ac7c7e06f30c9d95)
4. Run the development server:
```bash
   docker compose down && docker compose build --no-cache && docker compose up
```
5. HTTP Server will be available on [http://localhost:8080](http://localhost:8080)

## Triggers

The following triggers are configured in GCP:
 - push to (main|dev) branch to build and deploy to the corresponding environments
 - push to any branch to build an image and push to GCR

## Build an image & deploy to Teknoir DEV cloud

Run the following command from the root of the repo:

> The only params that can be modified are **SHORT_SHA** and **BRANCH_NAME**. Usually these would be filled in by the build trigger, but this is a manual build and in this context they just tag the image. 

```
gcloud --project=teknoir-mgmt builds submit . \
--config=cloudbuild.yaml \
--timeout=3600 \
--substitutions=\
SHORT_SHA="$(date +%Y%m%d-%H%M%S)",\
BRANCH_NAME="dev"
```

## Build an image & deploy to Teknoir cloud 

Run the following command from the root of the repo:

> The only params that can be modified are **SHORT_SHA** and **BRANCH_NAME**. Usually these would be filled in by the build trigger, but this is a manual build and in this context they just tag the image. 

```
gcloud --project=teknoir-mgmt builds submit . \
--config=cloudbuild.yaml \
--timeout=3600 \
--substitutions=\
SHORT_SHA="1.0.0",\
BRANCH_NAME="main"
```
