import AWS from "aws-sdk";
import { Customer } from "../../domain/vCustomer";
import { S3Credentials } from "../../domain/vS3Credentials";
import { PhotocloudAuthenticatedCustomer } from "../photocloudAPI/authenticatedCustomer";

async function Connect(creds: S3Credentials): Promise<AWS.S3> {
    return new AWS.S3({
        endpoint: new AWS.Endpoint(creds.endpoint),
        region: creds.region,
        credentials: new AWS.Credentials({accessKeyId:creds.access, secretAccessKey: creds.secret}),
    });
}

export const s3Connector = {
    Connect,
}