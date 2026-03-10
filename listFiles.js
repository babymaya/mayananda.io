const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: 'dpzz06lzn',
    api_key: '698567766991596',
    api_secret: 'QzEiszBxYmmCt1sDbvKdqLX1Wc8'
});

async function listFiles() {
    try {
        const [images, videos] = await Promise.all([
            cloudinary.api.resources({ type: 'upload', max_results: 500, resource_type: 'image' }),
            cloudinary.api.resources({ type: 'upload', max_results: 500, resource_type: 'video' })
        ]);

        const media = [
            ...images.resources.map(f => ({ src: f.secure_url, type: 'image' })),
            ...videos.resources.map(f => ({ src: f.secure_url, type: 'video' }))
        ];

        fs.writeFileSync('mediaList.json', JSON.stringify(media, null, 4));
        console.log('mediaList.json written successfully');
    } catch (err) {
        console.error('Error:', err);
    }
}

listFiles();