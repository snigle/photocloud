import {readFileSync} from "fs";
import { SyncPhoto } from "../pkg/usecase/syncPhoto";
import {ExifParserFactory} from "ts-exif-parser";
import { Login } from "../pkg/usecase/login";
import { NewPhotocloudConnector } from "../pkg/repository/connectors/photcloudAPI";
import { PhotoCloud } from "../pkg/repository/photocloudAPI/authenticatedCustomer";
import { ICacheConnector } from "../pkg/repository/connectors/cache";
import { LocalStorage } from "node-localstorage";
import { NewSwiftConnector } from "../pkg/repository/connectors/swift";
import { SwiftRepo } from "../pkg/repository/swift/photo";
import { ListPhoto } from "../pkg/usecase/listPhotoCloud";
import { googleClientID } from "./creds"

import fs from "fs"


function NewCacheConnector(): ICacheConnector {
    return {
        Connect: () => {
            return new LocalStorage('./cache');
        }
    }
}
async function main() : Promise<void> {
    const photocloudConnector = NewPhotocloudConnector()
    const cacheConnector = NewCacheConnector()
    const swiftConnector = NewSwiftConnector()
    
    const photocloudRepo = new PhotoCloud(photocloudConnector, cacheConnector)
    const swiftRepo = new SwiftRepo(swiftConnector)

    const loginUsecase = new Login(photocloudRepo)
    const listUseCase = new ListPhoto(photocloudRepo, swiftRepo)
    const syncUseCase = new SyncPhoto(photocloudRepo, swiftRepo)

    console.log("start");

    console.log("filename :")
    var stdinBuffer = fs.readFileSync(0); // STDIN_FILENO = 0
    const filename = stdinBuffer.toString()
    const file = readFileSync(filename);
    console.log("file loaded");
    
    const result = ExifParserFactory.create(file).parse();
    // console.log("result", result);
    // result.
    const creationDate = result.tags?.CreateDate ? new Date(result.tags.CreateDate * 1000) : new Date();

    if (! await loginUsecase.isLogged()){
        console.log(`Go to https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientID}&redirect_uri=http://localhost&response_type=token&scope=https://www.googleapis.com/auth/userinfo.email to get access_token`)
        var stdinBuffer = fs.readFileSync(0); // STDIN_FILENO = 0
        await loginUsecase.login(stdinBuffer.toString());
    }
    console.log("logged")
    const photos = await listUseCase.listPhotoCloud()
    console.log("list all photos",photos)
    console.log("sync file", filename.replace(/^.*\//,""))
    await syncUseCase.syncPhoto({name: filename.replace(/^.*\//,""), creationDate, content: file})
    console.log("photo synced");
}

main().then(() => process.exit(0));