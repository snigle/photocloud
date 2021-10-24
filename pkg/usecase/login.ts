import { AuthenticatedCustomer, IAuthenticatedCustomer } from "../domain/eAuthenticatedCustomer";

export class Login {

    constructor(private photocloudRepo: IAuthenticatedCustomer){}

    async login(accessToken: string): Promise<void> {
        let login: AuthenticatedCustomer | undefined;
        for (var i in [1,2,3,4,5]) {
            login = await this.photocloudRepo.Login(accessToken)
            if (login.subscription.status === "ok") {
                return
            }
            await new Promise(f => setTimeout(f, 1000))
        }
        throw `expected subscription status to be 'ok' but found ${login?.subscription.status}`
    }
    
    
    async isLogged(): Promise<boolean> {
        try {
            await this.photocloudRepo.Get()
        } catch(e) {
            return false
        }
        return true
    }
}
