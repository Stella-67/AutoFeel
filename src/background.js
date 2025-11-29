chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FC_FILL_FIELD') {
    handleFillField(message.payload)
      .then(response => sendResponse(response))
      .catch(err => {
        console.error("AutoFeel error:", err);
        sendResponse({ status: 'fail', reason: 'processing_error' });
      });
    return true;
  }
});

async function handleFillField(payload) {
  const { fieldDescriptor } = payload;
  const label = (fieldDescriptor.label || '').toLowerCase();
  const type = fieldDescriptor.type;

  let value = '';

  if (label.includes('first name') || label.includes('名字') || label.includes('firstname')) {
    value = 'Shiqi';
  } else if (label.includes('last name') || label.includes('姓') || label.includes('lastname')) {
    value = 'Liu';
  } else if (label.includes('email') || label.includes('邮箱')) {
    value = 'shiqi.liu@example.com';
  } else if (label.includes('phone') || label.includes('电话')) {
    value = '+1 (555) 123-4567';
  } else if (label.includes('address') || label.includes('地址')) {
    value = '123 Main Street';
  } else if (label.includes('city') || label.includes('城市')) {
    value = 'San Francisco';
  } else if (label.includes('state') || label.includes('州')) {
    value = 'CA';
  } else if (label.includes('zip') || label.includes('邮编')) {
    value = '94105';
  } else if (label.includes('company') || label.includes('公司')) {
    value = 'Tech Company Inc.';
  } else if (type === 'textarea' || label.includes('message') || label.includes('comment')) {
    value = 'This is a demo message filled by AutoFeel extension.';
  } else {
    value = 'AutoFeel Demo Value';
  }

  await new Promise(resolve => setTimeout(resolve, 300));

  return { status: 'success', value, reason: null };
}
