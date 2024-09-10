# fragments-ui
Use **npx parcel src/index.html --port 8080** to run the application on port 8080, otherwise parcel runs on localhost1234 by default **npx parcel src/index.html**.

Note to self: If 8080 doesn't work configure Allowed callback URLs and change to 1234;  Amazon Cognito > User Pools > fragments-users > App integration > choose your fragments-ui app client at the bottom, then click Edit beside the Hosted UI options. Make sure your Allowed callback URLs has correct URL for your local development environment.
