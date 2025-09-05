import mongoose, { Schema } from 'mongoose';
const linkSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    url: {
        type: String,
        required: true,
    },
    icon: {
        type: String,
        default: 'link',
    },
    order: {
        type: Number,
        default: 0,
    },
});
const customizationSchema = new Schema({
    backgroundColor: String,
    textColor: String,
    buttonStyle: String,
    font: String,
});
const clientSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    subdomain: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    description: {
        type: String,
        default: '',
    },
    theme: {
        type: String,
        default: 'default',
    },
    links: [linkSchema],
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    customization: {
        type: customizationSchema,
        default: {},
    },
    logo: {
        type: String,
    },
    isDeployed: {
        type: Boolean,
        default: false,
    },
    deploymentType: {
        type: String,
        enum: ['template', 'custom-html'],
        default: 'template',
    },
    htmlCode: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'lastUpdated',
    },
});
// Add index for faster queries
clientSchema.index({ owner: 1, createdAt: -1 });
export default mongoose.model('Client', clientSchema);
//# sourceMappingURL=Client.js.map