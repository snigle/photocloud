# PhotoCloud
A Google photo alternative

## Context
I'm using google photo to easily save my picture on the cloud and let free space on my devices. I like the smooth and fast UI, the share feature, and the compression which reduce the size of my photos.\
But I don't know where are my photo, I don't know what google do with them, I don't trust Google.\
Furthermore I don't see any alternative so easy to use.

## Business model
### Offers :
* 5Go Free for 15 000 photos.
* 100Go 2€ for 10 000 High Definition photos or 300 000 compressed photos
* Distant Backup 2€

### Storage costs
Storage cost on OVHCloud is 1ct/GB, so I keep 1€ of paying plan for the cost of the free plan.\
For 100 paying customers, I can offer 5 000GB which corresponds to 1000 free account.
Backup cost on OVHCloud is 1ct for 5GB.

### infrastructure costs 
Bandwidth 1ct/GB which should never been more than 10Mo per customer per day and should cost 6€ for 2000 users.
Authentication server to do the link to the customer with its S3 credentials. Start with 5€ for 2000 users.
Billing server to store credit cards and do the payement with bank providers.

## User stories
I want to save my photo in the cloud and let me the possibility to do backup.\
I want a smooth application to display my photos.\
I want to know where are stored my photos and who can have access to it and why.\
I want to share an album with my family.\
I want to automatically synchronise my photos of my smartphone(Android/IOS)/\
I want to upload and display my photo in my computer browser.\
I want to be sure my photos will never been deleted with a backup option in another region.\
\
I want to reduce the cost of the infrastructure to permit free access to most of people.


## Technical directions
Cheaper storage found is OVHCloud object storage and archive storage for backups\
Standard object storage is S3 Bucket API\
Image compression with ImageMagick, to reduce cost, do the compression in the browser with [WASM-ImageMagick](https://github.com/KnicKnic/WASM-ImageMagick)\
Frontend application using Cordova and Vue3 in typescript

## To be defined
How to store customer subscriptions and payments means.\
How to do the payment with credit card.


# Contributing
I don't defined the way to contribute but if you are interested by the project or you have advices, don't hesitate to contact me :) 
