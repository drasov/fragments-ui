// src/app.js
const apiUrl = process.env.API_URL || 'http://localhost:8080';
import { Auth, getUser } from './auth';
import { getUserFragments, getUserFragmentsExpanded} from './api';

async function init() {
  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');
  const fragmentTextArea = document.querySelector('#fragmentText');
  const submitBtn = document.querySelector('#submitFragment'); 

  // Wire up event handlers to deal with login and logout.
  loginBtn.onclick = () => {
    // Sign-in via the Amazon Cognito Hosted UI (requires redirects), see:
    // https://docs.amplify.aws/lib/auth/advanced/q/platform/js/#identity-pool-federation
    Auth.federatedSignIn();
  };
  logoutBtn.onclick = () => {
    // Sign-out of the Amazon Cognito Hosted UI (requires redirects), see:
    // https://docs.amplify.aws/lib/auth/emailpassword/q/platform/js/#sign-out
    Auth.signOut();
  };

  // See if we're signed in (i.e., we'll have a `user` object)
  const user = await getUser();
  if (!user) {
    // Disable the Logout button
    logoutBtn.disabled = true;
    return;
  }

  // Log the user info for debugging purposes
  console.log({ user });

  // Update the UI to welcome the user
  userSection.hidden = false;

  // Show the user's username
  userSection.querySelector('.username').innerText = user.username;

  // Disable the Login button
  loginBtn.disabled = true;

  // Do an authenticated request to the fragments API server and log the result
  const userFragments = await getUserFragments(user);
  const expandedUserFragments = await getUserFragmentsExpanded(user);
  submitBtn.onclick = async () => {
    const fragmentText = document.querySelector('#fragmentText').value;
    console.log('Initiating POST request for fragments data...');
    console.log('Data being posted: ' + fragmentText);
  
    const requestConfig = {
      method: "POST",
      body: fragmentText,
      headers: {
        Authorization: user.authorizationHeaders().Authorization,
        "Content-Type": "text/plain",
      },
    };
  
    try {
      const response = await fetch(`${apiUrl}/v1/fragments`, requestConfig);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log('Successfully posted fragment data:', { responseData });
    } catch (error) {
      console.error('Failed to POST to /v1/fragment', { error });
    }
  };
  
  
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);