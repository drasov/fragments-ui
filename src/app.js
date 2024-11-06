const apiUrl = process.env.API_URL || 'http://localhost:8080' || 'http://ec2-34-201-218-150.compute-1.amazonaws.com:8080';
import { Auth, getUser } from './auth';
import { getUserFragments, getUserFragmentsExpanded } from './api';

async function init() {
  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');
  const fragmentTextArea = document.querySelector('#fragmentText');
  const submitBtn = document.querySelector('#submitFragment');
  const refreshBtn = document.querySelector('#refreshFragments');
  const fragmentList = document.querySelector('#fragmentList'); // Assuming this exists to display the fragments
  const searchFragmentBtn = document.querySelector('#searchFragmentBtn'); // Button for searching fragment metadata
  const fragmentIdInput = document.querySelector('#fragmentId'); // Input field for fragment ID
  const metadataResult = document.querySelector('#metadataResult'); // Element to display metadata

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
    userSection.hidden = true; // Hide user section if no user is authenticated
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
  try {
    const userFragments = await getUserFragments(user);
    const expandedUserFragments = await getUserFragmentsExpanded(user);

    // Function to load fragments and display them in the UI
    const loadFragments = async () => {
      try {
        const response = await fetch(`${apiUrl}/v1/fragments`, {
          method: 'GET',
          headers: {
            Authorization: user.authorizationHeaders().Authorization,
          },
        });

        if (!response.ok) {
          throw new Error(`Error fetching fragments: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Log the fetched data structure for debugging
        console.log('Fetched fragments:', data);

        // Extract the fragments array from the response object
        const fragments = data.fragments;

        // Check if fragments is an array
        if (Array.isArray(fragments)) {
          // Clear the current list before appending new items
          fragmentList.innerHTML = '';

          // Append each fragment to the list
          fragments.forEach(fragment => {
            const listItem = document.createElement('li');
            listItem.textContent = fragment;  // Modify based on your fragment data structure
            fragmentList.appendChild(listItem);
          });
        } else {
          throw new Error('Fragments data is not an array');
        }

      } catch (error) {
        console.error('Error loading fragments:', error);
      }
    };

    // Load fragments when the page is ready
    refreshBtn.onclick = loadFragments;
    loadFragments();

    // Handle posting new fragments
    submitBtn.onclick = async (event) => {
      event.preventDefault();
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

    // Handle fetching fragment metadata
    searchFragmentBtn.onclick = async () => {
      const fragmentId = fragmentIdInput.value.trim();  // Get the fragment ID from the input field
    
      if (fragmentId) {
        try {
          // Make the GET request to fetch the fragment metadata using the correct API URL and headers
          const response = await fetch(`${apiUrl}/v1/fragments/${fragmentId}/info`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${user.idToken}`,  // Use the actual user's token here
            },
          });
    
          if (!response.ok) {
            throw new Error(`Error fetching fragment metadata: ${response.status} ${response.statusText}`);
          }
    
          // Parse the JSON response to get the metadata
          const metadata = await response.json();
    
          // Log the metadata for debugging
          console.log('Fragment metadata:', metadata);
    
          // Assuming the fragment metadata is in `metadata.fragment`, display it
          metadataResult.innerHTML = `
            <strong>Fragment ID:</strong> ${metadata.fragment.id} <br>
            <strong>Created:</strong> ${metadata.fragment.created} <br>
            <strong>Updated:</strong> ${metadata.fragment.updated} <br>
            <strong>Owner ID:</strong> ${metadata.fragment.ownerId} <br>
            <strong>Size:</strong> ${metadata.fragment.size} bytes <br>
            <strong>Type:</strong> ${metadata.fragment.type} <br>
          `;
        } catch (error) {
          console.error('Error fetching fragment metadata:', error);
          metadataResult.innerHTML = 'Error fetching fragment metadata.';
        }
      } else {
        metadataResult.innerHTML = 'Please enter a fragment ID.';
      }
    };
    

  } catch (error) {
    console.error('Error getting user fragments:', error);
  }
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
