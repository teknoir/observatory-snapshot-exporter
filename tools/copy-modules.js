const fs = require('fs-extra');

async function copyModules() {
  try {
    await fs.copy('src/workers', 'dist/workers');
    console.log('Module copied successfully!');
  } catch (err) {
    console.error('Error copying module:', err);
  }
}

copyModules();
