import {Customer} from "./vCustomer"
import { S3Credentials } from "./vS3Credentials"
import {Subscription} from "./vSubscription"
import { SwiftCredentials } from "./vSwiftCredentials"

export type AuthenticatedCustomer = {
    customer: Customer
    subscription: Subscription
    swiftCredentials: SwiftCredentials
    s3Credentials: S3Credentials
}

export interface IAuthenticatedCustomer {
    Login(access_token:string) : Promise<AuthenticatedCustomer>
    Get() : Promise<AuthenticatedCustomer>
    Refresh(access_token:string) : Promise<AuthenticatedCustomer>
    Logout(): Promise<void>
}