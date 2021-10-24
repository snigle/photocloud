import { resolve } from "path/posix";
import { AuthenticatedCustomer, IAuthenticatedCustomer } from "../../domain/eAuthenticatedCustomer";
import { Customer} from "../../domain/vCustomer";
import { S3Credentials } from "../../domain/vS3Credentials";
import { SwiftCredentials } from "../../domain/vSwiftCredentials";
import { ICacheConnector } from "../connectors/cache";
import { IPhotocloudConnector } from "../connectors/photcloudAPI";

export class PhotoCloud implements IAuthenticatedCustomer {
    constructor(private photocloudConnector: IPhotocloudConnector, private cacheConnector: ICacheConnector){}

    async Login(access_token:string) : Promise<AuthenticatedCustomer> {
        const api = this.photocloudConnector.Connect(access_token)
        const cache = this.cacheConnector.Connect()

        const resp = await api("/1.0/login",{method: "POST",  headers: {"X-Token" : access_token}})
        if (resp.status != 200) {
            throw `login failed with status ${resp.status}`;
        }
        const customer : AuthenticatedCustomer = await resp.json()

        cache.setItem("login", JSON.stringify(customer))
        return customer
    }
    
    Get() : Promise<AuthenticatedCustomer> {
        const cache = this.cacheConnector.Connect()
        const loginString = cache.getItem("login")
        if (!loginString) {
            throw "not logged"
        }
        const login : AuthenticatedCustomer = JSON.parse(loginString)
        return Promise.resolve(login)
    }
    
    Refresh(access_token:string) : Promise<AuthenticatedCustomer> {
        return this.Login(access_token)
    }
    
    Logout(): Promise<void> {
        const cache = this.cacheConnector.Connect()
        cache.clear()
        return Promise.resolve();
    }
}