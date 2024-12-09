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
  const fragmentList = document.querySelector('#fragmentList');
  const searchFragmentBtn = document.querySelector('#searchFragmentBtn');
  const fragmentIdInput = document.querySelector('#fragmentId');
  const metadataResult = document.querySelector('#metadataResult');
  const fragmentType = document.querySelector('#fragmentType');

  // Wire up event handlers for login/logout
  loginBtn.onclick = () => {
    Auth.federatedSignIn();
  };
  logoutBtn.onclick = () => {
    Auth.signOut();
  };

  // Check authentication
  const user = await getUser();
  if (!user) {
    logoutBtn.disabled = true;
    userSection.hidden = true;
    return;
  }

  console.log({ user });
  userSection.hidden = false;
  userSection.querySelector('.username').innerText = user.username;
  loginBtn.disabled = true;

  // Function to delete a fragment
  const deleteFragment = async (fragmentId) => {
    try {
      const response = await fetch(`${apiUrl}/v1/fragments/${fragmentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: user.authorizationHeaders().Authorization,
        },
      });

      if (!response.ok) {
        throw new Error(`Error deleting fragment: ${response.status} ${response.statusText}`);
      }

      // Refresh the fragments list after successful deletion
      loadFragments();
    } catch (error) {
      console.error('Error deleting fragment:', error);
    }
  };


  const convertTextFragment = (content, fromType, toType) => {
    // Ensure content is a string
    const contentStr = String(content);
  
    switch (toType) {
      case 'text/plain':
        // Strip any formatting for plain text
        return contentStr.replace(/<[^>]*>/g, '').trim();
      
      case 'text/markdown':
        // Convert to markdown
        if (fromType === 'text/html') {
          // Simple HTML to markdown conversion
          return contentStr
            .replace(/<h1>/g, '# ')
            .replace(/<h2>/g, '## ')
            .replace(/<strong>/g, '**')
            .replace(/<em>/g, '*')
            .replace(/<\/h1>|<\/h2>|<\/strong>|<\/em>|<p>|<\/p>|<br>/g, '');
        }
        return contentStr;
      
      case 'text/html':
        // Convert to HTML
        if (fromType === 'text/markdown') {
          // Simple markdown to HTML conversion
          return contentStr
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>');
        }
        return `<p>${contentStr}</p>`;
      
      case 'text/csv':
        // For JSON to CSV conversion
        if (fromType === 'application/json') {
          try {
            const data = JSON.parse(contentStr);
            if (Array.isArray(data)) {
              // Convert array of objects to CSV
              const headers = Object.keys(data[0] || {});
              const csvRows = [
                headers.join(','),
                ...data.map(obj => 
                  headers.map(header => 
                    `"${String(obj[header]).replace(/"/g, '""')}"`
                  ).join(',')
                )
              ];
              return csvRows.join('\n');
            }
            return contentStr;
          } catch {
            return contentStr;
          }
        }
        return contentStr;
      
      default:
        return contentStr;
    }
  };
  
  const updateFragment = async (fragmentId, newType) => {
    try {
    
      if (!user.authorizationHeaders().Authorization) {
        throw new Error('No authentication token found');
      }
    
      // Fetch the current fragment details
      const fragmentResponse = await fetch(`${apiUrl}/v1/fragments/${fragmentId}`, {
        method: 'GET',
        headers: {
          'Authorization': user.authorizationHeaders().Authorization,
        },
      });
    
      if (!fragmentResponse.ok) {
        throw new Error(`Error fetching fragment: ${fragmentResponse.status} ${fragmentResponse.statusText}`);
      }
    
      const fragment = await fragmentResponse.json();
      console.log('Fragment details:', fragment);
      
      // Fetch the fragment content
      const contentResponse = await fetch(`${apiUrl}/v1/fragments/${fragmentId}`, {
        method: 'GET',
        headers: {
          'Authorization': user.authorizationHeaders().Authorization,
        },
      });
    
      if (!contentResponse.ok) {
        throw new Error(`Error fetching fragment content: ${contentResponse.status} ${contentResponse.statusText}`);
      }
    
      // For image fragments, use the blob directly
      let content;
      if (fragment.type.startsWith('image/')) {
        // Read the image content as a blob
        content = await contentResponse.blob();
        
        console.log('Original blob details:', {
          size: content.size,
          type: content.type
        });
        
        // Verify blob is a valid image
        if (content.size < 100) {
          throw new Error(`Image blob is too small: ${content.size} bytes`);
        }
      } else {
        // For non-image fragments, use existing conversion logic
        const rawContent = await contentResponse.text();
        
        // Convert content if needed
        if (fragment.type !== newType) {
          if (fragment.type.startsWith('text/') || fragment.type === 'application/json') {
            content = convertTextFragment(rawContent, fragment.type, newType);
          }
        } else {
          content = rawContent;
        }
      }
    
      // Perform the conversion if types differ and it's an image
      let convertedContent = content;
      if (fragment.type.startsWith('image/') && fragment.type !== newType) {
        try {
          convertedContent = await convertImage(content, fragment.type, newType);
          
          console.log('Image conversion successful', {
            originalType: fragment.type,
            newType: newType,
            convertedBlobSize: convertedContent.size,
            convertedBlobType: convertedContent.type
          });
        } catch (conversionError) {
          console.error('Image conversion failed:', conversionError);
          // Fallback to original content if conversion fails
          convertedContent = content;
        }
      }
    
      // Update the fragment
      const response = await fetch(`${apiUrl}/v1/fragments/${fragmentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': user.authorizationHeaders().Authorization,
          'Content-Type': newType,
        },
        body: convertedContent,
      });
    
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error updating fragment: ${response.status} ${response.statusText}. Details: ${errorText}`);
      }
    
      // Refresh the fragments list
      loadFragments();
    } catch (error) {
      console.error('Full error details:', error);
      // Display error to user with more details
      alert(`Failed to update fragment: ${error.message}`);
    }
  };
  
  const convertImage = async (blob, fromType, toType) => {
    return new Promise((resolve, reject) => {
      // Enhanced validation
      if (!(blob instanceof Blob)) {
        reject(new Error('Input must be a Blob'));
        return;
      }
  
      console.log('Convert Image Input:', {
        blobSize: blob.size,
        blobType: blob.type,
        fromType,
        toType
      });
  
      // Check if the blob is actually an image
      if (!blob.type.startsWith('image/')) {
        reject(new Error(`Invalid image type: ${blob.type}`));
        return;
      }
  
      // Ensure blob has sufficient size
      if (blob.size < 100) {
        reject(new Error(`Blob too small: ${blob.size} bytes`));
        return;
      }
  
      // Create an object URL for the blob
      const objectURL = URL.createObjectURL(blob);
  
      // Create an image element
      const img = new Image();
      
      // Set up error handling
      img.onerror = () => {
        // Clean up the object URL
        URL.revokeObjectURL(objectURL);
        reject(new Error(`Failed to load image. 
          Blob size: ${blob.size} bytes, 
          Blob type: ${blob.type}, 
          Object URL: ${objectURL}`));
      };
  
      // Handle successful image load
      img.onload = () => {
        try {
          // Create a canvas to manipulate the image
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Convert to different format
          canvas.toBlob((convertedBlob) => {
            // Clean up the object URL
            URL.revokeObjectURL(objectURL);
  
            if (convertedBlob) {
              console.log('Converted Blob:', {
                size: convertedBlob.size,
                type: convertedBlob.type
              });
              resolve(convertedBlob);
            } else {
              reject(new Error('Failed to convert image blob'));
            }
          }, toType);
        } catch (conversionError) {
          // Clean up the object URL
          URL.revokeObjectURL(objectURL);
          reject(conversionError);
        }
      };
  
      // Set the image source to the object URL
      img.src = objectURL;
    });
  };


  // Enhanced loadFragments function with delete buttons
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
      console.log('Fetched fragments:', data);

      const fragments = data.fragments;

      if (Array.isArray(fragments)) {
        fragmentList.innerHTML = '';

        fragments.forEach(fragment => {
          const listItem = document.createElement('li');
          listItem.className = 'fragment-item';
          
          // Create fragment text container
          const fragmentText = document.createElement('span');
          fragmentText.textContent = fragment;

          // Create type dropdown
          const typeDropdown = document.createElement('select');
          typeDropdown.className = 'fragment-type-dropdown';
          const types = ['text/plain', 'text/markdown', 'text/html',  'text/csv', 'application/json', 'image/png','image/jpeg', 'image/webp', 'image/gif']; 
          types.forEach(type => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type;
          typeDropdown.appendChild(option);
        });
        typeDropdown.value = fragment.type; // Set current type as selected


          // Create update button
          const updateBtn = document.createElement('button');
          updateBtn.textContent = 'Update';
          updateBtn.className = 'update-btn';
          updateBtn.onclick = () => updateFragment(fragment, typeDropdown.value);

          
          // Create delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.className = 'delete-btn';
          deleteBtn.onclick = () => deleteFragment(fragment);
          
          // Add both elements to the list item
          listItem.appendChild(fragmentText);
          listItem.appendChild(deleteBtn);
          listItem.appendChild(updateBtn);
          listItem.appendChild(typeDropdown);
          fragmentList.appendChild(listItem);
        });
      } else {
        throw new Error('Fragments data is not an array');
      }
    } catch (error) {
      console.error('Error loading fragments:', error);
    }
  };

  // Wire up refresh button and initial load
  refreshBtn.onclick = loadFragments;
  loadFragments();

  // Handle posting new fragments
  submitBtn.onclick = async (event) => {
    event.preventDefault();
    const fragmentText = document.querySelector('#fragmentText').value;
    const fragmentType = document.getElementById('fragmentType').value;
    console.log('Initiating POST request for fragments data...');
    console.log('Data being posted: ' + fragmentText, 'Type:', fragmentType);
  
    const requestConfig = {
      method: "POST",
      body: JSON.stringify({
        type: fragmentType,
        content: fragmentText
      }),
      headers: {
        Authorization: user.authorizationHeaders().Authorization,
        "Content-Type": fragmentType,
      },
    };
    
    try {
      const response = await fetch(`${apiUrl}/v1/fragments`, requestConfig);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log('Successfully posted fragment data:', { responseData });
      // Refresh the list after posting
      loadFragments();
    } catch (error) {
      console.error('Failed to POST to /v1/fragment', { error });
    }
  };

// Handle fetching fragment metadata and content
searchFragmentBtn.onclick = async () => {
  const fragmentId = fragmentIdInput.value.trim();
  if (fragmentId) {
    try {
      // Fetch metadata
      const metadataResponse = await fetch(`${apiUrl}/v1/fragments/${fragmentId}/info`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${user.idToken}`,
        },
      });
      if (!metadataResponse.ok) {
        throw new Error(`Error fetching fragment metadata: ${metadataResponse.status} ${metadataResponse.statusText}`);
      }
      const metadata = await metadataResponse.json();
      console.log('Fragment metadata:', metadata);

      // Fetch fragment content
      const contentResponse = await fetch(`${apiUrl}/v1/fragments/${fragmentId}`, {
        method: 'GET',
        headers: {
          Authorization: user.authorizationHeaders().Authorization,
        },
      });
      if (!contentResponse.ok) {
        throw new Error(`Error fetching fragment content: ${contentResponse.status} ${contentResponse.statusText}`);
      }

     // Handle different content types
let fragmentContent = '';
const contentType = metadata.fragment.type;

if (contentType.startsWith('text/')) {
  // For text-based content, parse and extract content
  fragmentContent = await contentResponse.text();
  
  // Check if it's a JSON-formatted fragment
  try {
    const parsedContent = JSON.parse(fragmentContent);
    // Only use the 'content' property if it exists
    fragmentContent = parsedContent.content || parsedContent;
  } catch (jsonError) {
    // If not JSON, use the original text
    console.log('Not a JSON string, using original text');
  }
} else if (contentType.startsWith('image/')) {
  // For images, create a base64 encoded image
  const blob = await contentResponse.blob();
  const base64Content = await blobToBase64(blob);
  fragmentContent = `<img src="data:${contentType};base64,${base64Content}" alt="Fragment Image" style="max-width: 100%; max-height: 400px;">`;
} else if (contentType === 'application/json') {
  // For JSON, parse and extract content
  const jsonContent = await contentResponse.json();
  fragmentContent = JSON.stringify(jsonContent.content, null, 2);
}

// Helper function to convert blob to base64
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Update the metadata display
metadataResult.innerHTML = `
  <strong>Fragment ID:</strong> ${metadata.fragment.id} <br>
  <strong>Created:</strong> ${new Date(metadata.fragment.created).toLocaleString()} <br>
  <strong>Updated:</strong> ${new Date(metadata.fragment.updated).toLocaleString()} <br>
  <strong>Owner ID:</strong> ${metadata.fragment.ownerId} <br>
  <strong>Size:</strong> ${metadata.fragment.size} bytes <br>
  <strong>Type:</strong> ${metadata.fragment.type} <br>
  <strong>Fragment Content:</strong> <br>
  ${contentType.startsWith('image/') ? fragmentContent : `<pre>${fragmentContent}</pre>`}
`;
    } catch (error) {
      console.error('Error fetching fragment metadata or content:', error);
      metadataResult.innerHTML = 'Error fetching fragment metadata or content.';
    }
  } else {
    metadataResult.innerHTML = 'Please enter a fragment ID.';
  }
};

}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);