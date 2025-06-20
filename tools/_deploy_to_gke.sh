#!/bin/bash

# This script is used to deploy the application to GKE

function get_yq() {
    apt-get -y update && apt-get -y install wget -y
    wget -q https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq && chmod +x /usr/bin/yq
}

function get_credentials() {
    local CLOUDSDK_COMPUTE_ZONE=$1
    local PROJECT_ID=$2
    local TARGET_CLUSTER_NAME=$3
    gcloud container clusters get-credentials "${TARGET_CLUSTER_NAME}" --project "${PROJECT_ID}" --zone "${CLOUDSDK_COMPUTE_ZONE}"
}

function deploy_to_gke() {
    local APP_NAMESPACE=$1
    local CONTROLLER_NAMESPACE=$2
    local TEMP_FILE="/workspace/profile.yaml"

    # Get profile 
    kubectl get profiles.kubeflow.org ${APP_NAMESPACE} -n ${CONTROLLER_NAMESPACE} -o yaml > ${TEMP_FILE}

    # Update profile image tag
    IMAGE_TAG="${BRANCH_NAME//\//_}-${SHORT_SHA}" yq -i '(.spec.plugins[] | select(.kind=="SDMC").spec.snapshot_exporter_version) |= strenv(IMAGE_TAG)' ${TEMP_FILE}
    echo -e ">>> Deployment will be updated with the following params: \n`yq '(.spec.plugins[] | select(.kind=="SDMC"))' ${TEMP_FILE}`"

    # Apply profile again
    kubectl apply -f ${TEMP_FILE} -n ${CONTROLLER_NAMESPACE}
    
    # Trigger a new deployment
    kubectl delete deployment sdmc-wss-mqtt -n ${APP_NAMESPACE}
}

# Deploy to GKE dev
if [ "${BRANCH_NAME}" == "dev" ]; then
    get_yq
    get_credentials "us-central1-c" "teknoir-poc" "teknoir-dev-cluster"
    deploy_to_gke "demonstrations" "teknoir"
fi

# Deploy to GKE prod
if [ "${BRANCH_NAME}" == "main" ]; then
    get_yq
    get_credentials "us-central1-c" "teknoir" "teknoir-cluster"
    deploy_to_gke "teknoir-retail" "teknoir"
    deploy_to_gke "boxer-property" "teknoir"
    deploy_to_gke "prime-communications" "teknoir"
fi