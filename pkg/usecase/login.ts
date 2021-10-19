import { AuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";
import { PhotocloudAuthenticatedCustomer } from "../repository/photocloudAPI/authenticatedCustomer";

const CustomerRepo = PhotocloudAuthenticatedCustomer

export async function login(accessToken: string): Promise<void> {
    let login : AuthenticatedCustomer;
    for (var i in [1,2,3,4,5]) {
        login = await CustomerRepo.Login(accessToken)
        if (login.subscription.status === "ok") {
            return
        }
        await new Promise(f => setTimeout(f, 1000))
    }
    throw `expected subscription status to be 'ok' but found ${
        login.subscription.status}`
}


export async function isLogged(): Promise<boolean> {
    try {
        await CustomerRepo.Get()
    } catch(e) {
        return false
    }
    return true
}