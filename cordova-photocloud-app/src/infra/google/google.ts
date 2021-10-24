export async function getAccessToken(): Promise<string> {
  const loginConfig = {
    'scope': 'https://www.googleapis.com/auth/userinfo.email', // for browser
    'scopes': 'https://www.googleapis.com/auth/userinfo.email', // for android
    // offline:true,
    // webClientId: ""
  } 
  return new Promise<string>((resolve, reject) => 
    (window as any).plugins.googleplus.trySilentLogin(
      loginConfig,
      (credentials: any) => resolve(loginSuccess(credentials)),
      (msg: string) => {
        console.log("fail to silent login", msg);
        resolve("");
      })
  )
  .then(login => (login || new Promise((resolve, reject) =>
    (window as any).plugins.googleplus.login(
      loginConfig,
      (credentials: any) => resolve(loginSuccess(credentials)), 
      (msg: string) => {
        console.log("fail to login", msg)
        reject(`fail to login : ${msg}`);
      }
    ))
    )
    );
};

const loginSuccess = (credentials: any) : string => {
  // console.log(JSON.stringify(credentials)); // do something useful instead of alerting
  console.log("login success", credentials);
  return credentials.accessToken;
}