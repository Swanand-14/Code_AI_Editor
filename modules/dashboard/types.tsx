export interface User {
    id: string
    name: string
    email: string 
    image: string 
    createdAt: Date
    updatedAt: Date
}

export interface Project {
    id: string
    title: string
    description: string
    template: string
    userId: string
    user: User
    createdAt: Date
    updatedAt: Date
    Starmark:{isMarked:boolean}[]
}
