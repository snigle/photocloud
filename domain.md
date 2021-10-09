# Domain
**Customer**\
ID\
Name\
Backend\
S3Credentials\
*Create()*\
*Update()*\
*Delete()*\
*Get()*

**Subscription**\
CustomerID\
BilledUntil\
Plan\
*Create()*\
*Renew()*\
*Suspend()*\
*Reopen()*\
*Close()*

**UploadedPhoto**\
ID\
LocalID\
URL\
*Get()*\
*Upload()*\
*list()*\

**LocalPhoto**\
ID\
*compress()*\
*list()*

**Album**\
Title\
CustomerID\
Photos []ID\
Share []CustomerID\
*GetFromCustomer()*


# Use cases
    
**CreateCustomerWithGoogle(accessToken, backend, Name) Customer**


**GetGoogleCustomer(accessToken) Customer**

**RenewSubscription()**\
For each expired subscription not closed\
renew()\
if err \
suspend()


**SynchronisePhotos()**\
List local photos\
List Cloud photos\
for each local photo not in cloud \
ImportPhotos()

**ImportPhotos()**\
Compress and upload listed photos

**CloseInactiveFreeSubscription()**


