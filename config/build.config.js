/**
 * Build Configuration
 * Additional build settings and configurations
 */

module.exports = {
  // Application metadata
  app: {
    name: 'Layer Media Tool',
    description: 'A robust, scalable Electron application',
    author: 'Your Name',
    version: '1.0.0'
  },

  // Build targets
  targets: {
    mac: {
      dmg: true,
      zip: true,
      pkg: false
    },
    win: {
      nsis: true,
      portable: true,
      msi: false
    },
    linux: {
      appImage: true,
      deb: true,
      rpm: false,
      snap: false
    }
  },

  // File associations (optional)
  fileAssociations: [
    // {
    //   ext: 'myext',
    //   name: 'My File Type',
    //   description: 'My file type description',
    //   icon: 'build/icons/file-icon.png'
    // }
  ],

  // Protocol associations (optional)
  protocols: [
    // {
    //   name: 'my-app-protocol',
    //   schemes: ['myapp']
    // }
  ]
};
