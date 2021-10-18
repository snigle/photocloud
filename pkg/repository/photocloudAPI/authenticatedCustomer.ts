import { resolve } from "path/posix";
import { AuthenticatedCustomer, IAuthenticatedCustomer } from "../../domain/eAuthenticatedCustomer";
import { Customer} from "../../domain/vCustomer";
import { S3Credentials } from "../../domain/vS3Credentials";
import { SwiftCredentials } from "../../domain/vSwiftCredentials";
import { photocloudConnector } from "../connectors/photcloudAPI";

let login: AuthenticatedCustomer;

async function Login(access_token:string) : Promise<AuthenticatedCustomer> {
    const api = photocloudConnector.Connect(access_token)
    const resp = await api("/1.0/login",{method: "POST",  headers: {"X-Token" : access_token}})
    if (resp.status != 200) {
        throw `login failed with status ${resp.status}`;
    }
    const customer : AuthenticatedCustomer = await resp.json()
    login = customer
    return customer
}

function Get() : Promise<AuthenticatedCustomer> {
    if (!login) {
        throw "not logged"
    }
    return Promise.resolve(login)
}

function Refresh(access_token:string) : Promise<AuthenticatedCustomer> {
    return Login(access_token)
}

function Logout(): Promise<void> {
    login = undefined
    return Promise.resolve();
}

export const PhotocloudAuthenticatedCustomer: IAuthenticatedCustomer = {
    Login,
    Get,
    Refresh,
    Logout,
}