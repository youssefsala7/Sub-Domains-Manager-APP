import { Request } from 'express';
import { Document, Types } from 'mongoose';

export interface IUser extends Document {
	email: string;
	password: string;
	name: string;
	role: 'admin' | 'user';
	isEnabled: boolean;
	createdAt: Date;
	comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface ILink {
	title: string;
	url: string;
	icon?: string;
	order?: number;
}

export interface ICustomization {
	backgroundColor?: string;
	textColor?: string;
	buttonStyle?: string;
	font?: string;
}

export interface IClient extends Document {
	name: string;
	description: string;
	subdomain: string;
	theme: string;
	owner: Types.ObjectId;
	links: ILink[];
	isActive: boolean;
	customization: ICustomization;
	logo?: string;
	isDeployed: boolean;
	deploymentType: 'template' | 'custom-html';
	htmlCode?: string;
	createdAt: Date;
	lastUpdated: Date;
}

export interface AuthRequest extends Request {
	user?: {
		userId: string;
	};
}

export class CoolifyAPIError extends Error {
	constructor(
		message: string,
		public code: string,
		public status?: number,
		public response?: any
	) {
		super(message);
		this.name = 'CoolifyAPIError';
	}
}
